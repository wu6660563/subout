import { reactive } from "vue";

export const useConfigPreview = ({
  apiBase,
  token,
  getSerializedState,
  orderSections,
  showToast,
}) => {
  const previewModal = reactive({
    show: false,
    loading: false,
    error: "",
    content: "",
    jsonObject: null,
  });

  const requestConfig = (url, config) =>
    fetch(`${apiBase}${url}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify(config),
    });

  const getResponseError = async (response, fallback) => {
    let message = "";
    try {
      message = (await response.text()).trim();
    } catch {}
    return message || `${fallback} (HTTP ${response.status})`;
  };

  const previewGeneratedConfig = async () => {
    previewModal.show = true;
    previewModal.loading = true;
    previewModal.error = "";
    previewModal.content = "";
    previewModal.jsonObject = null;
    try {
      const config = getSerializedState();
      const validationResponse = await requestConfig(
        "/api/config/validate",
        config,
      );
      if (!validationResponse.ok) {
        previewModal.error = await getResponseError(
          validationResponse,
          "配置校验失败",
        );
        return;
      }

      let validation;
      try {
        validation = await validationResponse.json();
      } catch {
        previewModal.error = "配置校验接口返回了无效数据";
        return;
      }
      if (validation?.valid === false) {
        previewModal.error = validation.error || "配置校验失败";
        return;
      }

      const generatedResponse = await requestConfig(
        "/api/config/generated",
        config,
      );
      if (!generatedResponse.ok) {
        previewModal.error = await getResponseError(
          generatedResponse,
          "生成配置失败",
        );
        return;
      }

      const generatedConfig = await generatedResponse.json();
      if (
        !generatedConfig ||
        typeof generatedConfig !== "object" ||
        Array.isArray(generatedConfig)
      ) {
        previewModal.error = "生成配置接口返回了无效数据";
        return;
      }

      const ordered = orderSections(generatedConfig);
      previewModal.jsonObject = ordered;
      previewModal.content = JSON.stringify(ordered, null, 2);
    } catch (error) {
      previewModal.error = `网络请求失败: ${error.message}`;
    } finally {
      previewModal.loading = false;
    }
  };
  const copyPreviewToClipboard = () => {
    if (!previewModal.content) return;
    navigator.clipboard
      .writeText(previewModal.content)
      .then(() => showToast("配置已复制到剪贴板"))
      .catch(() => showToast("复制失败，请手动选择复制", "danger"));
  };
  const exportPreviewFile = () => {
    if (!previewModal.content) return;
    const blob = new Blob([previewModal.content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `singbox-config-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    showToast("配置已导出为 JSON 文件");
  };
  return {
    previewModal,
    previewGeneratedConfig,
    copyPreviewToClipboard,
    exportPreviewFile,
  };
};
