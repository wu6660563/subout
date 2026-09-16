export const useItemTypeHandlers = ({
  itemModal,
  isLinux,
  isApplePlatform,
  isWindowsPlatform,
  allOutboundTags,
  normalizeDnsServerForType,
  normalizeInboundForType,
  normalizeRuleSetForType,
  normalizeRouteRuleAction,
}) => {
const onModalDnsServerTypeChange = () => {
  const normalized = normalizeDnsServerForType(itemModal.itemData);
  Object.keys(itemModal.itemData).forEach((key) => delete itemModal.itemData[key]);
  Object.assign(itemModal.itemData, normalized);
};

const onInboundTypeChange = (inb) => {
  const normalized = normalizeInboundForType(inb, {
    isLinux: isLinux.value,
    isApplePlatform: isApplePlatform.value,
    isWindowsPlatform: isWindowsPlatform.value,
  });
  Object.keys(inb).forEach((key) => delete inb[key]);
  Object.assign(inb, normalized);
};

const onRuleSetTypeChange = (rs) => {
  const normalized = normalizeRuleSetForType(
    rs,
    allOutboundTags.value,
  );
  Object.keys(rs).forEach((key) => delete rs[key]);
  Object.assign(rs, normalized);
};

const onRouteRuleActionChange = () => {
  const normalized = normalizeRouteRuleAction(
    itemModal.itemData,
    allOutboundTags.value,
  );
  Object.keys(itemModal.itemData).forEach((key) => delete itemModal.itemData[key]);
  Object.assign(itemModal.itemData, normalized);
};

  return {
    onModalDnsServerTypeChange,
    onInboundTypeChange,
    onRuleSetTypeChange,
    onRouteRuleActionChange,
  };
};
