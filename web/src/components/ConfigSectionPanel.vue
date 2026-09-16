<template>
  <div v-if="active" class="panel">
    <ConfigSectionModeEditor
      :section="section"
      :mode="mode"
      :raw-json="rawJson"
      @set-mode="emit('set-mode', $event)"
    />

    <ConfigVisualSection
      :section="section"
      :mode="mode"
      :config-data="configData"
      :all-outbound-tags="allOutboundTags"
      :duplicate-route-rules-info="duplicateRouteRulesInfo"
      :edit-item="editItem"
      :duplicate-check-fn="duplicateCheckFn"
      :is-linux="isLinux"
      :is-apple-platform="isApplePlatform"
      :is-windows-platform="isWindowsPlatform"
      :basic-outbounds="basicOutbounds"
      :group-outbounds="groupOutbounds"
      :selected-group-tags="selectedGroupTags"
      :is-all-outbound-groups-selected="isAllOutboundGroupsSelected"
      :proxy-outbounds="proxyOutbounds"
      :selected-proxy-tags="selectedProxyTags"
      :is-all-proxies-selected="isAllProxiesSelected"
      @sync-rule="emit('sync-rule', $event)"
      @add-inbound="emit('add-inbound')"
      @inbound-type-change="emit('inbound-type-change', $event)"
      @edit-inbound="(...args) => emit('edit-inbound', ...args)"
      @remove-inbound="emit('remove-inbound', $event)"
      @add-basic-outbound="emit('add-basic-outbound')"
      @edit-basic-outbound="emit('edit-basic-outbound', $event)"
      @remove-outbound="emit('remove-outbound', $event)"
      @toggle-group-select-all="emit('toggle-group-select-all')"
      @batch-remove-groups="emit('batch-remove-groups')"
      @open-group-import="emit('open-group-import')"
      @toggle-group-selection="(...args) => emit('toggle-group-selection', ...args)"
      @edit-group-outbound="emit('edit-group-outbound', $event)"
      @toggle-proxy-select-all="emit('toggle-proxy-select-all')"
      @batch-remove-proxies="emit('batch-remove-proxies')"
      @open-node-pool-import="emit('open-node-pool-import')"
      @add-proxy-outbound="emit('add-proxy-outbound')"
      @toggle-proxy-selection="(...args) => emit('toggle-proxy-selection', ...args)"
      @edit-proxy-outbound="emit('edit-proxy-outbound', $event)"
      @open-domain-wizard="emit('open-domain-wizard', $event)"
    />
  </div>
</template>

<script setup>
import ConfigSectionModeEditor from "./ConfigSectionModeEditor.vue";
import ConfigVisualSection from "./ConfigVisualSection.vue";

defineProps({
  active: { type: Boolean, default: false },
  section: { type: String, required: true },
  mode: { type: String, default: "visual" },
  rawJson: { type: Object, required: true },
  configData: { type: Object, required: true },
  allOutboundTags: { type: Array, default: () => [] },
  duplicateRouteRulesInfo: { type: Object, default: () => ({}) },
  editItem: { type: Function, required: true },
  duplicateCheckFn: { type: Function, required: true },
  isLinux: { type: Boolean, default: true },
  isApplePlatform: { type: Boolean, default: false },
  isWindowsPlatform: { type: Boolean, default: false },
  basicOutbounds: { type: Array, default: () => [] },
  groupOutbounds: { type: Array, default: () => [] },
  selectedGroupTags: { type: Array, default: () => [] },
  isAllOutboundGroupsSelected: { type: Boolean, default: false },
  proxyOutbounds: { type: Array, default: () => [] },
  selectedProxyTags: { type: Array, default: () => [] },
  isAllProxiesSelected: { type: Boolean, default: false },
});

const emit = defineEmits([
  "set-mode",
  "sync-rule",
  "add-inbound",
  "inbound-type-change",
  "edit-inbound",
  "remove-inbound",
  "add-basic-outbound",
  "edit-basic-outbound",
  "remove-outbound",
  "toggle-group-select-all",
  "batch-remove-groups",
  "open-group-import",
  "toggle-group-selection",
  "edit-group-outbound",
  "toggle-proxy-select-all",
  "batch-remove-proxies",
  "open-node-pool-import",
  "add-proxy-outbound",
  "toggle-proxy-selection",
  "edit-proxy-outbound",
  "open-domain-wizard",
]);
</script>
