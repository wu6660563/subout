const normalizeHash = (rawHash) => String(rawHash || "").replace(/^#/, "");

export const getInitialActiveSection = (rawHash, sections) => {
  const hash = normalizeHash(rawHash);
  const [pathPart] = hash.split("?");
  const parts = pathPart.split("/").filter(Boolean);
  if (parts[0] === "config") {
    let tabCandidate = null;
    if (parts[1] === "edit" && parts[2] && parts[3]) {
      tabCandidate = parts[3];
    } else if (parts[1] && !isNaN(parseInt(parts[1], 10)) && parts[2]) {
      tabCandidate = parts[2];
    }
    if (tabCandidate && sections.includes(tabCandidate)) {
      return tabCandidate;
    }
  }
  if (hash.includes("tab=")) {
    const match = hash.match(/tab=([^&]+)/);
    if (match && sections.includes(match[1])) {
      return match[1];
    }
  }
  return "log";
};

export const parseConfigRoute = (rawHash, sections) => {
  const hash = normalizeHash(rawHash);
  const [pathPart] = hash.split("?");
  const parts = pathPart.split("/").filter(Boolean);
  let isEditing = false;
  let configId = null;
  let tab = null;

  if (parts[0] === "configs" || parts[0] === "config") {
    if (parts[1] === "edit" && parts[2]) {
      const id = parseInt(parts[2], 10);
      if (!isNaN(id)) {
        isEditing = true;
        configId = id;
        if (parts[3] && sections.includes(parts[3])) {
          tab = parts[3];
        }
      }
    } else if (parts[1] && !isNaN(parseInt(parts[1], 10))) {
      const id = parseInt(parts[1], 10);
      isEditing = true;
      configId = id;
      if (parts[2] && sections.includes(parts[2])) {
        tab = parts[2];
      }
    }
  }

  if (!tab && hash.includes("tab=")) {
    const match = hash.match(/tab=([^&]+)/);
    if (match && sections.includes(match[1])) {
      tab = match[1];
    }
  }

  return { isEditing, configId, tab };
};
