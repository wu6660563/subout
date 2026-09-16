<template>
              <!-- 2. Visual Mode -->
               <div v-show="mode === 'visual'">
                <LogConfigEditor
                  v-if="section === 'log'"
                  :config-data="configData"
                />
                <!-- DNS VISUAL -->
                <div v-if="section === 'dns'">
                  <DnsEditor
                    :config-data="configData"
                    :all-outbound-tags="allOutboundTags"
                    :edit-item="editItem"
                    :duplicate-check-fn="hasDuplicateInField"
                    @sync-rule="emit('sync-rule', $event)"
                  />
                </div>

                <InboundConfigEditor
                  v-if="section === 'inbounds'"
                  :config-data="configData"
                  :is-linux="isLinux"
                  :is-apple-platform="isApplePlatform"
                  :is-windows-platform="isWindowsPlatform"
                  @add-inbound="emit('add-inbound')"
                  @inbound-type-change="emit('inbound-type-change', $event)"
                  @edit-item="(...args) => emit('edit-inbound', ...args)"
                  @remove-inbound="emit('remove-inbound', $event)"
                />
                <!-- OUTBOUNDS VISUAL - OPTIMIZED -->
                <div v-if="section === 'outbounds'">
                  <OutboundConfigGuide />

                  <BasicOutboundConfigEditor
                    v-if="section === 'outbounds'"
                    :config-data="configData"
                    :basic-outbounds="basicOutbounds"
                    @add-basic-outbound="emit('add-basic-outbound')"
                    @edit-item="emit('edit-basic-outbound', $event)"
                    @remove-outbound="emit('remove-outbound', $event)"
                  />

                  <OutboundGroupConfigEditor
                    v-if="section === 'outbounds'"
                    :config-data="configData"
                    :group-outbounds="groupOutbounds"
                    :selected-group-tags="selectedGroupTags"
                    :is-all-outbound-groups-selected="isAllOutboundGroupsSelected"
                    @toggle-select-all="emit('toggle-group-select-all')"
                    @batch-remove="emit('batch-remove-groups')"
                    @open-group-import="emit('open-group-import')"
                    @toggle-group-selection="(...args) => emit('toggle-group-selection', ...args)"
                    @edit-item="emit('edit-group-outbound', $event)"
                    @remove-outbound="emit('remove-outbound', $event)"
                  />

                  <ProxyOutboundConfigEditor
                    v-if="section === 'outbounds'"
                    :config-data="configData"
                    :proxy-outbounds="proxyOutbounds"
                    :selected-proxy-tags="selectedProxyTags"
                    :is-all-proxies-selected="isAllProxiesSelected"
                    @toggle-select-all="emit('toggle-proxy-select-all')"
                    @batch-remove="emit('batch-remove-proxies')"
                    @open-node-pool-import="emit('open-node-pool-import')"
                    @add-proxy-outbound="emit('add-proxy-outbound')"
                    @toggle-proxy-selection="(...args) => emit('toggle-proxy-selection', ...args)"
                    @edit-item="emit('edit-proxy-outbound', $event)"
                    @remove-outbound="emit('remove-outbound', $event)"
                  />
                </div>

                <!-- ROUTE VISUAL -->
                <div v-if="section === 'route'">
                  <RouteEditor
                    :config-data="configData"
                    :all-outbound-tags="allOutboundTags"
                    :duplicate-route-rules-info="duplicateRouteRulesInfo"
                    :edit-item="editItem"
                    :duplicate-check-fn="hasDuplicateInField"
                    @sync-rule="emit('sync-rule', $event)"
                    @open-domain-wizard="emit('open-domain-wizard', $event)"
                  />
                </div>

                <ExperimentalConfigEditor
                  v-if="section === 'experimental'"
                  :config-data="configData"
                />
              </div>
</template>

<script setup>
import DnsEditor from "./DnsEditor.vue";
import RouteEditor from "./RouteEditor.vue";
import LogConfigEditor from "./LogConfigEditor.vue";
import InboundConfigEditor from "./InboundConfigEditor.vue";
import OutboundConfigGuide from "./OutboundConfigGuide.vue";
import BasicOutboundConfigEditor from "./BasicOutboundConfigEditor.vue";
import OutboundGroupConfigEditor from "./OutboundGroupConfigEditor.vue";
import ProxyOutboundConfigEditor from "./ProxyOutboundConfigEditor.vue";
import ExperimentalConfigEditor from "./ExperimentalConfigEditor.vue";

defineProps({
  section: { type: String, required: true },
  mode: { type: String, default: "visual" },
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
