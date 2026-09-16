import { serializeConfigState } from "./configStateSerialization.js";
import { validateFullConfigData as validateFullConfigDataUtil } from "./configValidation.js";

export const useConfigValidation = ({
  apiBase,
  token,
  sections,
  sectionModes,
  rawJson,
  sectionSerializers,
  validateData,
  showToast,
}) => {
  const getFullConfigData = () => serializeConfigState(
    sections,
    sectionModes,
    rawJson,
    sectionSerializers,
    {
      onParseError: (section, error) => {
        showToast(`[${section}] 模块 JSON 语法错误: ${error.message}`, "danger");
        throw error;
      },
    },
  );

  const validateFullConfigData = (fullData) => {
    const result = validateFullConfigDataUtil(fullData, validateData);
    if (!result.valid) showToast(result.message, "danger");
    return result.valid;
  };

  const validateFullConfigWithSingbox = async (fullData) => {
    if (!validateFullConfigData(fullData)) return false;
    try {
      const response = await fetch(`${apiBase}/api/config/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.value}`,
        },
        body: JSON.stringify(fullData),
      });
      if (response.ok) {
        const result = await response.json();
        if (result.command_missing) {
          showToast("系统未安装 sing-box，已跳过完整性校验。", "warning");
          return true;
        }
        if (!result.valid) {
          showToast(`sing-box 校验失败: ${result.error}`, "danger");
          return false;
        }
        return true;
      }
      showToast(`校验服务出错: ${(await response.text()) || "接口错误"}，跳过语法检测。`, "warning");
      return true;
    } catch {
      showToast("连接校验服务发生网络错误，跳过语法检测。", "warning");
      return true;
    }
  };

  return { getFullConfigData, validateFullConfigData, validateFullConfigWithSingbox };
};
