//! 应用自己的 HTTPS 客户端与代理配置，不启动 Codex 子进程。
use reqwest::{Client, ClientBuilder};
use std::{collections::HashMap, sync::Mutex, time::Duration};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const USER_AGENT: &str = concat!("codex-desk/", env!("CODEX_DESK_VERSION"));

#[derive(Clone, Default)]
pub struct ProxySettings {
    use_system_proxy: bool,
    custom_url: Option<String>,
}

impl ProxySettings {
    pub fn new(mode: &str, address: &str) -> Result<Self, String> {
        match mode {
            "off" => Ok(Self::default()),
            "system" => Ok(Self {
                use_system_proxy: true,
                custom_url: None,
            }),
            "custom" => {
                let url = tauri::Url::parse(address.trim())
                    .map_err(|_| "请输入完整的 HTTP 或 HTTPS 代理地址")?;
                if !matches!(url.scheme(), "http" | "https")
                    || url.host_str().is_none()
                    || !url.username().is_empty()
                    || url.password().is_some()
                    || !matches!(url.path(), "" | "/")
                    || url.query().is_some()
                    || url.fragment().is_some()
                {
                    return Err("代理地址仅支持 HTTP/HTTPS 主机与端口，不支持账号密码或路径".into());
                }
                Ok(Self {
                    use_system_proxy: false,
                    custom_url: Some(url.to_string()),
                })
            }
            _ => Err("无效的代理模式".into()),
        }
    }

    pub(crate) fn configure_http_client(
        &self,
        builder: ClientBuilder,
    ) -> Result<ClientBuilder, reqwest::Error> {
        if let Some(url) = &self.custom_url {
            Ok(builder.no_proxy().proxy(reqwest::Proxy::all(url)?))
        } else if self.use_system_proxy {
            Ok(builder)
        } else {
            Ok(builder.no_proxy())
        }
    }
}

struct Clients {
    settings: ProxySettings,
    by_timeout: HashMap<Duration, Client>,
    configured: bool,
}

pub struct HttpState {
    clients: Mutex<Clients>,
    // 一批查询持锁到刷新凭据落盘，防止两轮查询同时使用旧 refresh_token。
    pub quota_gate: tokio::sync::Mutex<()>,
}

impl Default for HttpState {
    fn default() -> Self {
        Self {
            clients: Mutex::new(Clients {
                settings: ProxySettings {
                    use_system_proxy: true,
                    custom_url: None,
                },
                by_timeout: HashMap::new(),
                configured: false,
            }),
            quota_gate: tokio::sync::Mutex::new(()),
        }
    }
}

impl HttpState {
    pub fn configure(&self, mode: &str, url: &str) -> Result<(), String> {
        let settings = ProxySettings::new(mode, url)?;
        let mut clients = self.clients.lock().map_err(|_| "无法更新网络配置")?;
        clients.settings = settings;
        clients.by_timeout.clear();
        clients.configured = true;
        Ok(())
    }

    pub fn client(&self, timeout: Duration) -> Result<Client, String> {
        let mut clients = self.clients.lock().map_err(|_| "无法读取网络配置")?;
        // 首次恢复代理失败时禁止退回默认路由，等待用户修正设置。
        if !clients.configured {
            return Err("请先在设置中保存有效的网络代理配置".into());
        }
        if let Some(client) = clients.by_timeout.get(&timeout) {
            return Ok(client.clone());
        }
        let builder = Client::builder()
            .user_agent(USER_AGENT)
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(timeout)
            .redirect(reqwest::redirect::Policy::none());
        let client = clients
            .settings
            .configure_http_client(builder)
            .and_then(ClientBuilder::build)
            .map_err(|_| "无法初始化网络客户端")?;
        clients.by_timeout.insert(timeout, client.clone());
        Ok(client)
    }
}

/// 仅返回固定错误分类，不能把可能带认证参数的 URL、响应正文或令牌送到前端。
pub fn network_error(service: &str, error: &reqwest::Error) -> String {
    if error.is_timeout() {
        return format!("{service}查询超时，请检查网络和代理");
    }
    let mut cause = std::error::Error::source(error);
    let mut description = String::new();
    while let Some(current) = cause {
        description.push_str(&current.to_string().to_lowercase());
        cause = current.source();
    }
    let category = if description.contains("certificate")
        || description.contains("tls")
        || description.contains("ssl")
        || description.contains("证书")
    {
        "TLS 证书或安全连接失败"
    } else if description.contains("dns")
        || description.contains("resolve")
        || description.contains("解析")
    {
        "DNS 解析失败"
    } else if description.contains("proxy") || description.contains("代理") {
        "代理连接失败"
    } else if error.is_connect() {
        "连接失败，请检查网络和代理"
    } else {
        "网络请求失败"
    };
    format!("{service}：{category}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clients_require_valid_configuration_and_change_with_proxy_settings() {
        let state = HttpState::default();
        let timeout = Duration::from_secs(1);
        assert!(state.client(timeout).is_err());
        assert!(state.configure("custom", "invalid").is_err());
        assert!(state.client(timeout).is_err());
        state.configure("off", "").unwrap();
        state.client(timeout).unwrap();
        assert_eq!(state.clients.lock().unwrap().by_timeout.len(), 1);
        state.configure("system", "").unwrap();
        assert!(state.clients.lock().unwrap().by_timeout.is_empty());
        state.client(timeout).unwrap();
    }
    #[test]
    fn http_proxy_modes_follow_saved_settings() {
        use std::{
            io::{BufRead, BufReader, Write},
            net::TcpListener,
            thread,
            time::{Duration, Instant},
        };

        for (mode, scheme) in [
            ("off", "http"),
            ("system", "http"),
            ("custom", "http"),
            ("system", "https"),
            ("custom", "https"),
        ] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            listener.set_nonblocking(true).unwrap();
            let address = listener.local_addr().unwrap();
            // 关闭/自定义模式继承一个不可用代理，确保请求不会误走环境中的路由。
            let unused_proxy = TcpListener::bind("127.0.0.1:0").unwrap();
            let environment_proxy = if mode == "system" {
                address
            } else {
                unused_proxy.local_addr().unwrap()
            };
            let server = thread::spawn(move || {
                let deadline = Instant::now() + Duration::from_secs(8);
                let mut stream = loop {
                    match listener.accept() {
                        Ok((stream, _)) => break stream,
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                            assert!(
                                Instant::now() < deadline,
                                "未收到预期的 {mode}/{scheme} 请求"
                            );
                            thread::sleep(Duration::from_millis(10));
                        }
                        Err(error) => panic!("本地测试服务失败：{error}"),
                    }
                };
                stream.set_nonblocking(false).unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                let mut reader = BufReader::new(&mut stream);
                let mut request_line = String::new();
                reader.read_line(&mut request_line).unwrap();
                loop {
                    let mut line = String::new();
                    if reader.read_line(&mut line).unwrap() == 0 || line == "\r\n" {
                        break;
                    }
                }
                drop(reader);
                // HTTPS 只核对 CONNECT 路由，不建立 TLS、不访问外网或读取真实凭据。
                let response = if scheme == "https" {
                    "HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                } else {
                    "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok"
                };
                stream.write_all(response.as_bytes()).unwrap();
                request_line
            });
            let url = if mode == "off" {
                format!("http://{address}/usage")
            } else {
                format!("{scheme}://quota.invalid/usage")
            };
            // 单独的测试进程隔离环境变量和 HTTP 库的代理缓存，避免干扰并行测试。
            let mut child = std::process::Command::new(std::env::current_exe().unwrap());
            for key in [
                "HTTP_PROXY",
                "HTTPS_PROXY",
                "ALL_PROXY",
                "http_proxy",
                "https_proxy",
                "all_proxy",
                "NO_PROXY",
                "no_proxy",
                "REQUEST_METHOD",
            ] {
                child.env_remove(key);
            }
            let output = child
                .args([
                    "--exact",
                    "http_client::tests::http_proxy_probe",
                    "--ignored",
                    "--nocapture",
                ])
                .env("HTTP_PROXY", format!("http://{environment_proxy}"))
                .env("HTTPS_PROXY", format!("http://{environment_proxy}"))
                .env("CODEX_DESK_TEST_PROXY_MODE", mode)
                .env("CODEX_DESK_TEST_PROXY_URL", format!("http://{address}"))
                .env("CODEX_DESK_TEST_REQUEST_URL", &url)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{mode}/{scheme}: {}{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
            let request_line = server.join().unwrap();
            let expected = if mode == "off" {
                "GET /usage HTTP/1.1\r\n".to_owned()
            } else if scheme == "https" {
                "CONNECT quota.invalid:443 HTTP/1.1\r\n".to_owned()
            } else {
                format!("GET {url} HTTP/1.1\r\n")
            };
            assert_eq!(request_line, expected, "{mode}/{scheme}");
        }
    }

    #[test]
    #[ignore = "由 http_proxy_modes_follow_saved_settings 在独立进程中调用"]
    fn http_proxy_probe() {
        let Ok(mode) = std::env::var("CODEX_DESK_TEST_PROXY_MODE") else {
            return;
        };
        let address = std::env::var("CODEX_DESK_TEST_PROXY_URL").unwrap();
        let url = std::env::var("CODEX_DESK_TEST_REQUEST_URL").unwrap();
        let settings = ProxySettings::new(&mode, &address).unwrap();
        tauri::async_runtime::block_on(async {
            let client = settings
                .configure_http_client(reqwest::Client::builder())
                .unwrap()
                .timeout(std::time::Duration::from_secs(2))
                .build()
                .unwrap();
            let result = client.get(&url).send().await;
            if url.starts_with("https://") {
                assert!(result.is_err(), "本地测试代理应拒绝 CONNECT 隧道");
            } else {
                assert_eq!(result.unwrap().status(), reqwest::StatusCode::OK);
            }
        });
    }
}
