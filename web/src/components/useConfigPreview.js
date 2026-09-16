import { reactive } from "vue";

export const useConfigPreview = ({ apiBase, token, getSerializedState, orderSections, showToast }) => {
  const previewModal = reactive({ show: false, loading: false, error: "", content: "", jsonObject: null });
  const previewGeneratedConfig = async () => {
    previewModal.show = true; previewModal.loading = true; previewModal.error = ""; previewModal.content = "";
    try {
      const response = await fetch(`${apiBase}/api/config/preview`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.value}` }, body: JSON.stringify(getSerializedState()),
      });
      if (!response.ok) { previewModal.error = (await response.text()) || "生成配置失败"; return; }
      const ordered = orderSections(await response.json());
      previewModal.jsonObject = ordered; previewModal.content = JSON.stringify(ordered, null, 2);
    } catch (error) { previewModal.error = `网络请求失败: ${error.message}`; }
    finally { previewModal.loading = false; }
  };
  const copyPreviewToClipboard = () => {
    if (!previewModal.content) return;
    navigator.clipboard.writeText(previewModal.content).then(() => showToast("配置已复制到剪贴板")).catch(() => showToast("复制失败，请手动选择复制", "danger"));
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
  return { previewModal, previewGeneratedConfig, copyPreviewToClipboard, exportPreviewFile };
};
