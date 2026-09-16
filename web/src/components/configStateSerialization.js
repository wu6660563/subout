export const getConfigSectionContent = (
  section,
  mode,
  rawJson,
  serializers,
) => {
  if (mode === "visual") {
    const serialize = serializers[section];
    return serialize ? serialize() : undefined;
  }
  return JSON.parse(rawJson[section]);
};

export const serializeConfigState = (
  sections,
  sectionModes,
  rawJson,
  serializers,
  { onParseError } = {},
) => {
  const state = {};
  sections.forEach((section) => {
    if (sectionModes[section] === "visual") {
      if (serializers[section]) {
        state[section] = getConfigSectionContent(
          section,
          sectionModes[section],
          rawJson,
          serializers,
        );
      }
    } else {
      try {
        state[section] = getConfigSectionContent(
          section,
          sectionModes[section],
          rawJson,
          serializers,
        );
      } catch (error) {
        onParseError?.(section, error);
        state[section] = null;
      }
    }
  });
  return state;
};
