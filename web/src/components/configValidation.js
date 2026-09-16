const findDuplicateTags = (list) => {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const duplicates = new Set();

  for (const item of list) {
    if (item && typeof item === "object" && item.tag) {
      if (seen.has(item.tag)) {
        duplicates.add(item.tag);
      } else {
        seen.add(item.tag);
      }
    }
  }

  return Array.from(duplicates);
};

const invalid = (message) => ({ valid: false, message });

export const validateFullConfigData = (fullData, validateSection) => {
  for (const section of Object.keys(fullData)) {
    const result = validateSection(section, fullData[section]);
    if (!result.valid) {
      return invalid(
        `[${section}] 配置校验失败: ${result.errors}`,
      );
    }
  }

  if (Array.isArray(fullData.outbounds)) {
    const duplicateOutbounds = findDuplicateTags(fullData.outbounds);
    if (duplicateOutbounds.length > 0) {
      return invalid(
        `[outbounds] 配置校验失败: 出站连接中存在重复的 tag: "${duplicateOutbounds.join('", "')}"，请修改或删除重复项。`,
      );
    }

    const groupTypes = [
      "selector",
      "urltest",
      "url-test",
      "fallback",
      "loadbalance",
    ];
    for (let index = 0; index < fullData.outbounds.length; index++) {
      const outbound = fullData.outbounds[index];
      if (
        outbound &&
        groupTypes.includes(outbound.type) &&
        (!Array.isArray(outbound.outbounds) || outbound.outbounds.length === 0)
      ) {
        return invalid(
          `[outbounds] 配置校验失败: 第 ${index + 1} 项出站 "${outbound.tag || "未命名"}" (${outbound.type}) 未配置任何目标节点/出站 (outbounds 列表为空)，请在编辑界面为其添加至少一个目标出站。`,
        );
      }
    }
  }

  if (Array.isArray(fullData.inbounds)) {
    const duplicateInbounds = findDuplicateTags(fullData.inbounds);
    if (duplicateInbounds.length > 0) {
      return invalid(
        `[inbounds] 配置校验失败: 入站连接中存在重复的 tag: "${duplicateInbounds.join('", "')}"`,
      );
    }
  }

  return { valid: true, message: "" };
};
