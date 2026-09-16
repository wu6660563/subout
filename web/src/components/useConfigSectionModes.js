import { prepareSectionModeChange } from "./sectionModeUtils.js";
import { getConfigSectionContent } from "./configStateSerialization.js";

export const useConfigSectionModes = ({
  apiBase,
  token,
  sectionModes,
  rawJson,
  sectionParsers,
  sectionSerializers,
  validateData,
  showToast,
  loadAllSections,
}) => {
  const setSectionMode = (section, mode) => {
    if (sectionModes[section] === mode) return;

    if (mode === "visual") {
      try {
        const { parsed } = prepareSectionModeChange(mode, rawJson[section]);
        sectionParsers[section]?.(parsed);
        sectionModes[section] = mode;
      } catch (error) {
        showToast(
          `JSON 语法解析错误: ${error.message}。请在源码模式下修复再切换。`,
          "danger",
        );
      }
      return;
    }

    const { rawJson: serialized } = prepareSectionModeChange(
      mode,
      rawJson[section],
      sectionSerializers[section],
    );
    rawJson[section] = serialized;
    sectionModes[section] = mode;
  };

  const saveVueConfigSection = async (section) => {
    let finalObj;
    try {
      finalObj = getConfigSectionContent(
        section,
        sectionModes[section],
        rawJson,
        sectionSerializers,
      );
    } catch (error) {
      showToast(`JSON 语法错误: ${error.message}`, "danger");
      return;
    }

    const validation = validateData(section, finalObj);
    if (!validation.valid) {
      showToast(`配置校验失败: ${validation.errors}`, "danger");
      return;
    }

    try {
      const response = await fetch(`${apiBase}/api/config/base`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.value}`,
        },
        body: JSON.stringify({ section, content: finalObj }),
      });

      if (response.ok) {
        showToast(`模板 [${section}] 段保存成功`);
        await loadAllSections();
      } else {
        showToast(
          `保存 [${section}] 失败: ${(await response.text()) || "接口错误"}`,
          "danger",
        );
      }
    } catch {
      showToast("保存配置网络请求发生错误", "danger");
    }
  };

  return { setSectionMode, saveVueConfigSection };
};
