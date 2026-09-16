import { reactive } from "vue";
import { prepareImportedConfig } from "./configImportUtils.js";

export const useConfigImport = ({ apiBase, token, configData, rawJson, isLinux, isApplePlatform, parseLog, parseDns, parseInbounds, parseOutbounds, parseRoute, parseExperimental, confirmDialog, showToast, onImported }) => {
  const importModal = reactive({ show: false, content: "", error: "", validating: false });
  const openImportModal = () => Object.assign(importModal, { show: true, content: "", error: "", validating: false });
  const hasConfigContent = () =>
    Boolean(
      configData.outbounds?.length || configData.dns?.servers?.length ||
      configData.dns?.rules?.length || configData.inbounds?.length ||
      configData.route?.rules?.length || configData.route?.rule_set?.length,
    );
  const openImportInEdit = async () => {
    if (hasConfigContent()) {
      const confirmed = await confirmDialog(
        "导入完整配置将覆盖当前编辑中的所有配置内容（未保存的改动会丢失）。是否继续？",
        { title: "导入覆盖确认", confirmText: "确认导入", cancelText: "取消", isDanger: true },
      );
      if (!confirmed) return;
    }
    openImportModal();
  };
  const confirmImport = async () => {
    try {
      const parsed = JSON.parse(importModal.content);
      if (typeof parsed !== "object" || parsed === null) {
        importModal.error = "配置内容必须是一个 JSON 对象";
        return;
      }
      const { sections, notices } = prepareImportedConfig(parsed, {
        isLinux: isLinux.value,
        isApplePlatform: isApplePlatform.value,
      });
      const { log, dns, inbounds, outbounds, route, experimental } = sections;
      if (notices.removedAutoRedirect) showToast("检测到导入配置中包含「自动重定向 (auto_redirect)」，当前系统非 Linux，该配置将被忽略并已自动删除。", "warning");
      if (notices.resetInterfaceName) showToast("检测到导入配置中 TUN 网卡名称在当前系统不兼容，已自动重置为系统自动分配。", "info");
      importModal.validating = true;
      importModal.error = "";
      const response = await fetch(`${apiBase}/api/config/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.value}` },
        body: JSON.stringify({ log, dns, inbounds, outbounds, route, experimental }),
      });
      if (!response.ok) {
        importModal.error = `校验服务出错: ${(await response.text()) || "接口错误"}`;
        return;
      }
      const result = await response.json();
      if (result.command_missing) {
        showToast("系统未检测到 sing-box 命令，已跳过完整性校验，请自行导出配置进行验证。", "warning");
      } else if (!result.valid) {
        importModal.error = `sing-box 校验失败: ${result.error}`;
        showToast(`sing-box 校验失败: ${result.error}`, "danger");
        return;
      }
      parseLog(log); parseDns(dns); parseInbounds(inbounds); parseOutbounds(outbounds); parseRoute(route); parseExperimental(experimental);
      rawJson.log = JSON.stringify(log, null, 2); rawJson.dns = JSON.stringify(dns, null, 2);
      rawJson.inbounds = JSON.stringify(inbounds, null, 2); rawJson.outbounds = JSON.stringify(outbounds, null, 2);
      rawJson.route = JSON.stringify(route, null, 2); rawJson.experimental = JSON.stringify(experimental, null, 2);
      showToast("成功导入并解析完整配置！请检查各配置段后点击「保存配置」持久化。");
      importModal.show = false;
      onImported?.();
    } catch (error) {
      importModal.error = `JSON 语法解析错误或导入失败: ${error.message}`;
    } finally {
      importModal.validating = false;
    }
  };
  return { importModal, openImportModal, openImportInEdit, hasConfigContent, confirmImport };
};
