const MAX_RELEASE_NOTES = 6;
const VERSION_FILE_URL = "https://raw.githubusercontent.com/xiaotao-xiaotao/codex-desk/main/version.json";
const RELEASE_API_PREFIX = "https://api.github.com/repos/xiaotao-xiaotao/codex-desk/releases/tags/v";
const SEMVER_PATTERN = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function parseVersion(value) {
  const match = SEMVER_PATTERN.exec(String(value ?? "").trim());
  if (!match) throw new Error(`无效的语义化版本：${value}`);
  return {
    core: match.slice(1, 4).map(Number),
    prerelease: match[4]?.split(".") ?? [],
  };
}

function comparePrerelease(left, right) {
  if (left.length === 0 || right.length === 0) return Number(left.length === 0) - Number(right.length === 0);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    const leftNumber = /^\d+$/.test(left[index]) ? Number(left[index]) : null;
    const rightNumber = /^\d+$/.test(right[index]) ? Number(right[index]) : null;
    if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) return leftNumber - rightNumber;
    if (leftNumber !== null && rightNumber === null) return -1;
    if (leftNumber === null && rightNumber !== null) return 1;
    const comparison = left[index].localeCompare(right[index], "en");
    if (comparison !== 0) return comparison;
  }
  return 0;
}

export function compareVersions(leftValue, rightValue) {
  const left = parseVersion(leftValue);
  const right = parseVersion(rightValue);
  for (let index = 0; index < left.core.length; index += 1) {
    if (left.core[index] !== right.core[index]) return left.core[index] - right.core[index];
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

function selectReleaseNotes(notes, language) {
  const selected = notes?.[language] ?? notes?.["zh-CN"] ?? notes?.en;
  if (Array.isArray(selected)) return selected.join("\n");
  return typeof selected === "string" ? selected : null;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`GitHub 请求失败：HTTP ${response.status}`);
  return response.json();
}

function releaseNoteLines(notes) {
  return String(notes ?? "")
    .split(/\r?\n/)
    .map((line) => line
      .replace(/^\s*(?:[-*+] |#{1,6}\s*)/, "")
      .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
      .trim())
    .filter(Boolean)
    .slice(0, MAX_RELEASE_NOTES);
}

/** 仅在用户主动触发时访问 GitHub，并在同一提示卡中反馈所有检查结果。 */
export function createUpdateBannerView({ t, invoke, triggerButton, getLanguage, getCurrentVersion }) {
  const banner = document.querySelector("#update-banner");
  const icon = document.querySelector(".update-banner-icon");
  const title = document.querySelector("#update-banner-title");
  const version = document.querySelector("#update-banner-version");
  const notes = document.querySelector("#update-banner-notes");
  const openButton = document.querySelector("#update-banner-open");
  const dismissButton = document.querySelector("#update-banner-dismiss");
  let result = null;
  let state = "idle";

  function render() {
    triggerButton.title = triggerButton.ariaLabel = t("checkForUpdates");
    triggerButton.disabled = state === "checking";
    triggerButton.classList.toggle("is-loading", state === "checking");
    triggerButton.setAttribute("aria-busy", String(state === "checking"));
    banner.hidden = state === "idle";
    if (banner.hidden) return;

    notes.hidden = state !== "available";
    openButton.hidden = state !== "available";
    dismissButton.hidden = state === "checking";
    dismissButton.textContent = state === "available" ? t("updateLater") : t("updateDismiss");
    icon.textContent = { checking: "…", current: "✓", error: "!", available: "↑" }[state];

    if (state === "checking") {
      title.textContent = t("checkingUpdatesTitle");
      version.textContent = t("checkingUpdatesDescription");
      return;
    }
    if (state === "error") {
      title.textContent = t("updateCheckFailedTitle");
      version.textContent = t("updateCheckFailedDescription");
      return;
    }
    if (state === "current") {
      title.textContent = t("upToDateTitle");
      version.textContent = t("upToDateSummary", { current: result.currentVersion });
      return;
    }

    title.textContent = t("updateAvailableTitle");
    version.textContent = t("updateVersionSummary", {
      current: result.currentVersion,
      latest: result.latestVersion,
    });
    if (result.publishedAt) {
      version.textContent += ` · ${t("updatePublishedAt", { date: result.publishedAt })}`;
    }
    const lines = releaseNoteLines(result.releaseNotes);
    notes.replaceChildren(...(lines.length > 0 ? lines : [t("updateNotesUnavailable")]).map((line) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      return paragraph;
    }));
    openButton.textContent = t("updateViewRelease");
  }

  async function check() {
    if (state === "checking") return;
    state = "checking";
    render();
    try {
      const [currentVersion, versionFile] = await Promise.all([
        getCurrentVersion(),
        fetchJson(VERSION_FILE_URL),
      ]);
      const latestVersion = String(versionFile.version ?? "").trim();
      const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;
      let releaseNotes = selectReleaseNotes(versionFile.releaseNotes, getLanguage());
      if (updateAvailable && !releaseNotes) {
        try {
          const release = await fetchJson(`${RELEASE_API_PREFIX}${encodeURIComponent(latestVersion)}`);
          releaseNotes = typeof release.body === "string" ? release.body : null;
        } catch (error) {
          // Release 可能尚未创建或 API 暂时限流；版本文件已确认升级时仍显示更新提示。
          console.warn("读取 GitHub Release 说明失败", error);
        }
      }
      result = {
        currentVersion,
        latestVersion,
        updateAvailable,
        publishedAt: versionFile.publishedAt ?? null,
        releaseNotes,
      };
      state = result.updateAvailable ? "available" : "current";
    } catch (error) {
      console.warn("检查 Codex Desk 更新失败", error);
      state = "error";
    }
    render();
  }

  openButton.addEventListener("click", async () => {
    openButton.disabled = true;
    try {
      await invoke("open_update_page");
    } catch (error) {
      console.error("打开 Codex Desk 更新页面失败", error);
    } finally {
      openButton.disabled = false;
    }
  });
  dismissButton.addEventListener("click", () => {
    state = "idle";
    render();
  });
  triggerButton.addEventListener("click", check);

  return { check, updateLanguage: render };
}
