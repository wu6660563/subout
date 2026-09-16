export const prepareSectionModeChange = (mode, rawJson, serialize) => {
  if (mode === "visual") {
    return { mode, parsed: JSON.parse(rawJson) };
  }

  const value = serialize ? serialize() : {};
  return {
    mode,
    rawJson: JSON.stringify(value, null, 2),
  };
};
