export const appendPresetProcesses = (currentValue, procName) => {
  const lines = (currentValue || "")
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const toAdd = Array.isArray(procName)
    ? procName
    : String(procName)
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean);

  for (const item of toAdd) {
    if (!lines.includes(item)) lines.push(item);
  }
  return lines.join("\n");
};
