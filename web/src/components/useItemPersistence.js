import { watch } from "vue";

export const useItemPersistence = ({
  itemModal,
  configData,
  isLinux,
  syncVisualToItemData,
  sanitizeOutboundItem,
  getOutboundGroupValidationError,
  validateData,
  getListByType,
  getSerializedState,
  apiBase,
  token,
  showToast,
  extractCriteriaFromObj,
  buildItemValidationData,
  ITEM_ARRAY_FIELDS_WITHOUT_PORT,
  getDuplicateItemTagError,
}) => {
const saveItem = async () => {
  itemModal.error = "";

  if (itemModal.mode === "visual") {
    syncVisualToItemData();
  } else {
    try {
      const parsed = JSON.parse(itemModal.jsonText);
      itemModal.itemData = parsed;
    } catch (e) {
      itemModal.error = `JSON 语法错误: ${e.message}`;
      return;
    }
  }

  if (
    itemModal.itemType === "inbound" &&
    itemModal.itemData &&
    !isLinux.value
  ) {
    delete itemModal.itemData.auto_redirect;
  }

  if (itemModal.itemType === "outbound" && itemModal.itemData) {
    itemModal.itemData = sanitizeOutboundItem(itemModal.itemData);
    const groupValidationError = getOutboundGroupValidationError(
      itemModal.itemData,
    );
    if (groupValidationError) {
      itemModal.error = groupValidationError;
      showToast(groupValidationError, "danger");
      return;
    }
  }

  // 1. JSON Schema Validate
  const check = validateData(itemModal.itemType, itemModal.itemData);
  if (!check.valid) {
    itemModal.error = `格式错误: ${check.errors}`;
    showToast(`格式错误: ${check.errors}`, "danger");
    return;
  }

  // 2. sing-box Validate
  const list = getListByType(itemModal.itemType);
  let originalListBackup = null;
  let tempState = null;
  if (list) {
    originalListBackup = [...list];
    if (itemModal.idx >= 0) {
      list[itemModal.idx] = JSON.parse(JSON.stringify(itemModal.itemData));
    } else {
      list.push(JSON.parse(JSON.stringify(itemModal.itemData)));
    }
  }
  try {
    tempState = getSerializedState();
  } catch (e) {
    itemModal.error = `配置序列化失败: ${e.message}`;
    return;
  } finally {
    if (list && originalListBackup) {
      list.length = 0;
      list.push(...originalListBackup);
    }
  }

  itemModal.validating = true;
  try {
    const res = await fetch(`${apiBase}/api/config/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify(tempState),
    });

    if (res.ok) {
      const result = await res.json();
      if (result.command_missing) {
        showToast(
          "系统未检测到 sing-box 命令，已跳过完整性校验，请自行导出配置进行验证。",
          "warning",
        );
      } else if (!result.valid) {
        itemModal.error = `sing-box 校验失败: ${result.error}`;
        showToast(`sing-box 校验失败: ${result.error}`, "danger");
        return;
      } else {
        showToast("sing-box 校验成功！", "success");
      }
    } else {
      const errText = await res.text();
      showToast(`校验服务出错: ${errText || "接口错误"}`, "danger");
      return;
    }
  } catch {
    showToast("连接校验服务发生网络错误", "danger");
    return;
  } finally {
    itemModal.validating = false;
  }

  if (itemModal.itemType === "route_rule") {
    const newItems = extractCriteriaFromObj(itemModal.itemData);
    const existingDuplicates = [];

    if (Array.isArray(configData.route?.rules)) {
      configData.route.rules.forEach((rule, idx) => {
        if (idx === itemModal.idx) return;
        const outbound = rule.outbound || rule.action || "未配置出站";
        const existingItems = extractCriteriaFromObj(rule);

        newItems.forEach((newItem) => {
          const match = existingItems.find(
            (e) =>
              e.category === newItem.category &&
              e.normValue === newItem.normValue,
          );
          if (match) {
            existingDuplicates.push({
              typeLabel: newItem.typeLabel,
              value: newItem.rawValue,
              existingRuleIndex: idx + 1,
              existingOutbound: outbound,
            });
          }
        });
      });
    }

    if (existingDuplicates.length > 0) {
      const dupDescs = existingDuplicates
        .map(
          (d) =>
            `${d.typeLabel} '${d.value}' (已存在于规则 #${d.existingRuleIndex} -> ${d.existingOutbound})`,
        )
        .join("；");
      showToast(`提示：已存在重复规则项：${dupDescs}`, "warning");
    }
  }

  if (itemModal.onSave) {
    itemModal.onSave(JSON.parse(JSON.stringify(itemModal.itemData)));
  }
  itemModal.show = false;
};

// Real-time validation watcher
watch(
  () => [
    itemModal.itemData,
    itemModal.tempFields,
    itemModal.jsonText,
    itemModal.mode,
    itemModal.routeRuleLogic,
  ],
  () => {
    if (itemModal.show) {
      validateItemModal();
    }
  },
  { deep: true },
);

const validateItemModal = () => {
  let data = {};
  if (itemModal.mode === "visual") {
    const arrayFields = ITEM_ARRAY_FIELDS_WITHOUT_PORT;
    data = buildItemValidationData(
      itemModal.itemData,
      itemModal.tempFields,
      itemModal.itemType,
      itemModal.routeRuleLogic,
      arrayFields,
    );
  } else {
    try {
      data = JSON.parse(itemModal.jsonText);
    } catch (e) {
      itemModal.error = `JSON 语法错误: ${e.message}`;
      return false;
    }
  }

  const check = validateData(itemModal.itemType, data);
  if (!check.valid) {
    itemModal.error = check.errors;
    return false;
  } else {
    const duplicateTagError = getDuplicateItemTagError(
      itemModal.itemType,
      data,
      configData,
      itemModal.idx,
    );
    if (duplicateTagError) {
      itemModal.error = duplicateTagError;
      return false;
    }
    itemModal.error = "";
    return true;
  }
};

  return { saveItem, validateItemModal };
};
