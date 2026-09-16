const APPLE_PRESETS = [
  {
    label: "🌐 Chrome",
    name: ["Google Chrome", "Google Chrome Helper"],
    title: "添加 Chrome 浏览器进程 (Google Chrome / Helper)",
  },
  {
    label: "🦊 Firefox",
    name: "firefox",
    title: "添加 Firefox 浏览器进程 (firefox)",
  },
  {
    label: "🌐 Edge",
    name: ["Microsoft Edge", "Microsoft Edge Helper"],
    title: "添加 Edge 浏览器进程 (Microsoft Edge / Helper)",
  },
  {
    label: "🧭 Safari",
    name: ["Safari", "com.apple.WebKit.Networking"],
    title: "添加 Safari 浏览器进程 (Safari / WebKit)",
  },
  {
    label: "🦁 Brave",
    name: ["Brave Browser", "Brave Browser Helper"],
    title: "添加 Brave 浏览器进程 (Brave Browser / Helper)",
  },
  {
    label: "🌐 Chromium",
    name: ["Chromium", "Chromium Helper"],
    title: "添加 Chromium 浏览器进程 (Chromium / Helper)",
  },
];

const WINDOWS_PRESETS = [
  ["🌐 Chrome", "chrome.exe"],
  ["🦊 Firefox", "firefox.exe"],
  ["🌐 Edge", "msedge.exe"],
  ["🦁 Brave", "brave.exe"],
  ["🌐 Chromium", "chromium.exe"],
];

const UNIX_PRESETS = [
  ["🌐 Chrome", "chrome"],
  ["🦊 Firefox", "firefox"],
  ["🌐 Edge", "msedge"],
  ["🦁 Brave", "brave"],
  ["🌐 Chromium", "chromium"],
];

const toExecutablePresets = (presets) =>
  presets.map(([label, name]) => ({
    label,
    name,
    title: `添加 ${label.slice(2).trimStart()} 浏览器进程 (${name})`,
  }));

export const getBrowserPresets = (systemOs) => {
  if (systemOs === "macos" || systemOs === "darwin") {
    return APPLE_PRESETS;
  }
  if (systemOs === "windows") {
    return toExecutablePresets(WINDOWS_PRESETS);
  }
  return toExecutablePresets(UNIX_PRESETS);
};

export const getProcessNamePlaceholder = (systemOs) => {
  if (systemOs === "macos" || systemOs === "darwin") {
    return "Google Chrome\nMicrosoft Edge\nfirefox\nSafari";
  }
  if (systemOs === "windows") {
    return "chrome.exe\nfirefox.exe\nmsedge.exe";
  }
  return "chrome\nfirefox\nmsedge";
};

export const getProcessPathPlaceholder = (systemOs) => {
  if (systemOs === "macos" || systemOs === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome\n/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
  }
  if (systemOs === "windows") {
    return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\nC:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  }
  return "/opt/google/chrome/chrome\n/usr/lib/firefox/firefox";
};
