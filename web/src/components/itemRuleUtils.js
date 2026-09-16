export const buildLogicalRuleCriteria = (tempFields, arrayFields) => {
  const rules = [];

  arrayFields.forEach((field) => {
    if (tempFields[field] !== undefined && tempFields[field] !== null) {
      const value = tempFields[field].trim();
      if (value) {
        const list = value
          .split(/[\n,]+/)
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
        if (list.length > 0) rules.push({ [field]: list });
      }
    }
  });

  if (tempFields.port) {
    const value = tempFields.port.trim();
    if (value) {
      const list = value
        .split(/[\n,]+/)
        .map((item) => parseInt(item.trim()))
        .filter((number) => !isNaN(number));
      if (list.length > 0) rules.push({ port: list });
    }
  }

  return rules;
};

export const normalizeStandardRuleFields = (
  itemData,
  tempFields,
  arrayFields,
  itemType,
) => {
  const normalized = JSON.parse(JSON.stringify(itemData));

  arrayFields.forEach((field) => {
    if (tempFields[field] !== undefined && tempFields[field] !== null) {
      const value = tempFields[field].trim();
      if (value) {
        normalized[field] = value
          .split(/[\n,]+/)
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
      } else {
        delete normalized[field];
      }
    }
  });

  if (tempFields.port) {
    const value = tempFields.port.trim();
    if (value) {
      if (itemType === "outbound") {
        normalized.port = parseInt(value);
      } else {
        normalized.port = value
          .split(/[\n,]+/)
          .map((item) => parseInt(item.trim()))
          .filter((number) => !isNaN(number));
      }
    } else {
      delete normalized.port;
    }
  }

  return normalized;
};

export const buildItemValidationData = (
  itemData,
  tempFields,
  itemType,
  routeRuleLogic,
  arrayFields,
) => {
  const data = JSON.parse(JSON.stringify(itemData));

  arrayFields.forEach((field) => {
    if (tempFields[field] !== undefined && tempFields[field] !== null) {
      const value = tempFields[field].trim();
      if (value) {
        data[field] = value
          .split(/[\n,]+/)
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
      } else {
        delete data[field];
      }
    }
  });

  if (tempFields.port) {
    const value = tempFields.port.trim();
    if (value) {
      data.port = value
        .split(/[\n,]+/)
        .map((item) => parseInt(item.trim()))
        .filter((number) => !isNaN(number));
    } else {
      delete data.port;
    }
  }

  if (itemType === "outbound" && data.port !== undefined) {
    data.server_port = parseInt(data.port);
    delete data.port;
  }

  if (
    ["route_rule", "dns_rule"].includes(itemType) &&
    routeRuleLogic &&
    routeRuleLogic !== "standard"
  ) {
    data.type = "logical";
    data.mode = routeRuleLogic;
    const rules = [];
    arrayFields.forEach((field) => {
      if (data[field]) {
        rules.push({ [field]: data[field] });
        delete data[field];
      }
    });
    if (data.port) {
      rules.push({ port: data.port });
      delete data.port;
    }
    data.rules = rules;
  }

  return data;
};
