export const useConfigHistoryActions = ({ apiBase, token, currentConfigId, currentConfigDetail, getFullConfigData, validateFullConfig, loadAllSections, startEditConfig, backToList, promptDialog, confirmDialog, showToast }) => {
  const request = (path, init = {}) => fetch(`${apiBase}${path}`, { ...init, headers: { Authorization: `Bearer ${token.value}`, ...(init.headers || {}) } });
  const saveConfig = async () => { if (!currentConfigId.value) return; let content; try { content = getFullConfigData(); } catch { return; } if (!(await validateFullConfig(content))) return; try { const res = await request(`/api/config/history/${currentConfigId.value}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ detail: currentConfigDetail.value || "未命名配置", content }) }); if (res.ok) { showToast("配置已成功更新保存！"); await loadAllSections(); } else showToast(`保存失败: ${(await res.text()) || "接口错误"}`, "danger"); } catch { showToast("保存配置网络请求失败", "danger"); } };
  const create = async (detail, content) => request("/api/config/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ detail, content }) });
  const saveAsNewConfig = async () => { let content; try { content = getFullConfigData(); } catch { return; } const detail = await promptDialog("请输入新配置的名称/备注:", "另存配置", { title: "另存配置" }); if (detail === null) return; try { const res = await create(detail || "另存配置", content); if (res.ok) { const item = await res.json(); showToast("已成功另存为新配置！"); await loadAllSections(); await startEditConfig(item.id); } else showToast(`另存失败: ${(await res.text()) || "接口错误"}`, "danger"); } catch { showToast("网络请求失败", "danger"); } };
  const createNewConfigItem = async () => { const detail = await promptDialog("请输入新建配置的名称/备注:", "新建配置", { title: "新建配置" }); if (detail === null) return; try { const res = await create(detail || "未命名配置", null); if (res.ok) { const item = await res.json(); showToast("新建配置成功！"); await loadAllSections(); await startEditConfig(item.id); } else showToast(`创建失败: ${(await res.text()) || "接口错误"}`, "danger"); } catch { showToast("网络请求失败", "danger"); } };
  const deleteConfigItem = async (id) => { if (!(await confirmDialog("确定要删除此配置项吗？", { isDanger: true }))) return; try { const res = await request(`/api/config/history/${id}`, { method: "DELETE" }); if (!res.ok) return showToast("删除失败", "danger"); showToast("配置项已删除"); if (currentConfigId.value === id) { currentConfigId.value = null; backToList(); } await loadAllSections(); } catch { showToast("网络请求失败", "danger"); } };
  const duplicateConfigItem = async (id) => {
    try {
      const res = await request(`/api/config/history/${id}`);
      if (!res.ok) {
        showToast("获取原配置内容失败", "danger");
        return;
      }
      const detailItem = await res.json();
      const defaultName = `${detailItem.detail || "配置"} - 副本`;
      const detail = await promptDialog("请输入新配置的名称/备注:", defaultName, {
        title: "复制配置",
      });
      if (detail === null) return;

      let content = null;
      if (detailItem.content) {
        try {
          content = typeof detailItem.content === "string"
            ? JSON.parse(detailItem.content)
            : detailItem.content;
        } catch {
          content = {};
        }
      }

      const createRes = await create(detail.trim() || defaultName, content);
      if (createRes.ok) {
        showToast("已成功复制配置！");
        await loadAllSections();
      } else {
        showToast(`复制失败: ${(await createRes.text()) || "接口错误"}`, "danger");
      }
    } catch {
      showToast("网络请求失败", "danger");
    }
  };
  return { saveConfig, saveAsNewConfig, createNewConfigItem, deleteConfigItem, duplicateConfigItem };
};
