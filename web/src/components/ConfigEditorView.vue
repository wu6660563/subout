<template>
  <div class="view-container">
    <div v-if="!isEditing" class="view-header">
      <div
        style="
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 1rem;
          width: 100%;
        "
      >
        <div>
          <h1>配置管理</h1>
          <p>
            管理您的分流订阅配置文件。您可以创建不同的配置模板进行编辑，并一键启用该配置。
          </p>
        </div>
        <div v-if="!isEditing" class="flex gap-2">
          <button class="btn" @click="createNewConfigItem">➕ 新建配置</button>
        </div>
      </div>
    </div>

    <!-- Import Modal -->
    <config-import-modal
      :import-modal="importModal"
      :confirm-import="confirmImport"
    />

    <!-- Running Config Settings Modal -->
    <running-config-modal
      :running-config-modal="runningConfigModal"
      :running-config="runningConfig"
      :running-config-form="runningConfigForm"
      :config-list="configList"
      :close-running-config-modal="closeRunningConfigModal"
      :copy-log-console="copyLogConsole"
      :save-running-config-settings="saveRunningConfigSettings"
    />

    <div class="view-body">
      <!-- 运行配置卡片 -->
      <RunningConfigCard
        v-if="!isEditing"
        :running-config="runningConfig"
        :running-config-name="getRunningConfigName(runningConfig.config_id)"
        @open-running-config-modal="openRunningConfigModal"
      />

  <!-- Config Preview Modal -->
    <config-preview-modal
      :preview-modal="previewModal"
      :copy-preview-to-clipboard="copyPreviewToClipboard"
      :export-preview-file="exportPreviewFile"
    />

      <!-- 1. Config List Table Page -->
      <ConfigListPanel
        v-if="!isEditing"
        :config-list="configList"
        :paginated-configs="paginatedConfigs"
        :current-page="currentPage"
        :page-size="pageSize"
        @update-sort-order="updateConfigSortOrder"
        @sync-latest-resources="syncLatestResources"
        @edit="startEditConfig"
        @duplicate="duplicateConfigItem"
        @export="exportConfigById"
        @delete="deleteConfigItem"
        @update:page-size="pageSize = $event"
        @update:current-page="currentPage = $event"
      />

      <!-- 2. Config Details Edit Page -->
      <div v-else class="config-main fill-height">
        <ConfigEditorHeader
          :current-config-id="currentConfigId"
          :current-config-detail="currentConfigDetail"
          :active-section="activeSection"
          :sections="sections"
          :is-current-config-running="isCurrentConfigRunning"
          :running-config-modal="runningConfigModal"
          @back="backToList"
          @import="openImportInEdit"
          @preview="previewGeneratedConfig"
          @save-as-new="saveAsNewConfig"
          @save="saveConfig"
          @trigger-update="triggerUpdateFromDetail"
          @update:current-config-detail="currentConfigDetail = $event"
          @update:active-section="activeSection = $event"
        />

        <!-- Section Content -->
        <div class="config-editor-scroll-body">
          <template v-for="section in sections" :key="section">
            <ConfigSectionPanel
              :active="activeSection === section"
              :section="section"
              :mode="sectionModes[section]"
              :raw-json="rawJson"
              :config-data="configData"
              :all-outbound-tags="allOutboundTags"
              :duplicate-route-rules-info="duplicateRouteRulesInfo"
              :edit-item="editItem"
              :duplicate-check-fn="hasDuplicateInField"
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
              @set-mode="setSectionMode(section, $event)"
              @sync-rule="openSyncModal"
              @add-inbound="addInbound"
              @inbound-type-change="onInboundTypeChange"
              @edit-inbound="(inb, idx) => editItem(inb, 'inbound', (parsed) => (configData.inbounds[idx] = parsed), idx)"
              @remove-inbound="configData.inbounds.splice($event, 1)"
              @add-basic-outbound="addBasicOutbound"
              @edit-basic-outbound="editBasicOutbound"
              @remove-outbound="confirmRemoveOutbound"
              @toggle-group-select-all="toggleSelectAllOutboundGroups"
              @batch-remove-groups="batchRemoveGroups"
              @open-group-import="openGroupImport"
              @toggle-group-selection="toggleGroupSelection"
              @edit-group-outbound="editGroupOutbound"
              @toggle-proxy-select-all="toggleSelectAllProxies"
              @batch-remove-proxies="batchRemoveProxies"
              @open-node-pool-import="openNodePoolImport"
              @add-proxy-outbound="addProxyOutbound"
              @toggle-proxy-selection="toggleProxySelection"
              @edit-proxy-outbound="editProxyOutbound"
              @open-domain-wizard="openDomainWizard"
            />
          </template>
        </div>
      </div>
      <!-- close config-main -->
    </div>
    <!-- close view-body -->

    <ConfigItemEditorModal
      :item-modal="itemModal"
      :config-data="configData"
      :all-outbound-tags="allOutboundTags"
      :browser-presets="browserPresets"
      :is-linux="isLinux"
      :is-apple-platform="isApplePlatform"
      :is-windows-platform="isWindowsPlatform"
      :show-advanced-dns-fields="showAdvancedDnsFields"
      :show-advanced-route-fields="showAdvancedRouteFields"
      :preset-url-select-config="presetUrlSelectConfig"
      :process-name-placeholder="processNamePlaceholder"
      :process-path-placeholder="processPathPlaceholder"
      :get-address-placeholder="getAddressPlaceholder"
      @close="itemModal.show = false"
      @set-mode="setItemModalMode"
      @save="saveItem"
      @dns-server-type-change="onModalDnsServerTypeChange"
      @inbound-type-change="onInboundTypeChange"
      @ruleset-type-change="onRuleSetTypeChange"
      @route-rule-action-change="onRouteRuleActionChange"
      @toggle-advanced-dns="showAdvancedDnsFields = !showAdvancedDnsFields"
      @toggle-advanced-route="showAdvancedRouteFields = !showAdvancedRouteFields"
      @append-preset-process="appendPresetProcess"
      @preset-url-change="onPresetUrlChangeConfig"
      @update:preset-url-select-config="presetUrlSelectConfig = $event"
    />
    <NodePoolImportModal
      :node-pool-modal="nodePoolModal"
      :filtered-node-pool-nodes="filteredNodePoolNodes"
      :selectable-node-pool-nodes="selectableNodePoolNodes"
      :has-selected-update="hasSelectedUpdate"
      :is-all-node-pool-selected="isAllNodePoolSelected"
      :get-node-status="getNodeStatus"
      @close="nodePoolModal.show = false"
      @clear-search="nodePoolModal.searchQuery = ''"
      @clear-selection="nodePoolModal.selectedIds = []"
      @toggle-select-all="toggleSelectAllNodePool"
      @invert-selection="invertNodePoolSelection"
      @confirm-import="confirmNodePoolImport"
    />
    <GroupImportModal
      :group-import-modal="groupImportModal"
      :outbound-groups="outboundGroups"
      :available-groups-to-import="availableGroupsToImport"
      :filtered-groups-to-import="filteredGroupsToImport"
      :selectable-groups-to-import="selectableGroupsToImport"
      :is-all-groups-selected="isAllGroupsSelected"
      :is-group-imported="isGroupImported"
      :get-group-node-count="getGroupNodeCount"
      :get-group-nodes-display="getGroupNodesDisplay"
      :import-group="importGroup"
      @close="groupImportModal.show = false"
      @clear-search="clearGroupSearchQuery"
      @clear-selection="groupImportModal.selectedTags = []"
      @toggle-select-all="toggleSelectAllGroups"
      @invert-selection="invertGroupsSelection"
      @confirm-import="confirmBatchGroupImport"
    />
    <RuleSyncModal
      :rule-sync-modal="ruleSyncModal"
      :config-data="configData"
      :all-outbound-tags="allOutboundTags"
      :get-rule-summary-text="getRuleSummaryText"
      @close="ruleSyncModal.show = false"
      @confirm-sync="confirmSyncRule"
    />
    <DomainWizardModal
      :domain-wizard-modal="domainWizardModal"
      :sorted-outbounds-for-select="sortedOutboundsForSelect"
      :matching-existing-rule="matchingExistingRule"
      @start-latency-test="startLatencyTest"
      @confirm-apply="confirmApplyDomainWizard"
      @close="domainWizardModal.show = false"
    />
  </div>
</template>

<script setup>
import {
  ref,
  reactive,
  onMounted,
  onUnmounted,
} from "vue";
import {
  token,
  API_BASE,
  showToast,
  confirmDialog,
  promptDialog,
  sessionSudoPassword,
  setSessionSudoPassword,
  systemModeInfo,
  serviceStatus,
  fetchServiceStatus,
} from "../store.js";
import { validateData } from "../validator.js";
import {
  formatGroupNodesDisplay as getGroupNodesDisplay,
  getGroupNodeCount,
} from "../utils/groupImport.js";
import {
  getOutboundTypeDisplay,
  getProtocolBadgeClass,
  getProxyTypeDisplay,
  sanitizeOutboundItem,
} from "./outboundUtils.js";
import {
  isGroupOutbound,
} from "./outboundManagementUtils.js";
import { useOutboundSelections } from "./useOutboundSelections.js";
import { getConfigItemList } from "./configItemUtils.js";
import { normalizeInboundForType } from "./inboundUtils.js";
import { normalizeRuleSetForType } from "./ruleSetUtils.js";
import { normalizeRouteRuleAction } from "./routeRuleUtils.js";
import {
  buildItemValidationData,
  buildLogicalRuleCriteria,
  normalizeStandardRuleFields,
} from "./itemRuleUtils.js";
import {
  ITEM_ARRAY_FIELDS,
  ITEM_ARRAY_FIELDS_WITHOUT_PORT,
  buildItemTempFields,
  getDuplicateItemTagError,
  getOutboundGroupValidationError,
  mergeLogicalRuleTempFields,
  serializeItemDataForSource,
} from "./itemEditorUtils.js";
import {
  getAddressPlaceholder,
  normalizeDnsServerForType,
} from "./dnsServerUtils.js";
import { extractCriteriaFromObj } from "./routeRuleDuplicateUtils.js";
import { getRuleSummaryText as getRuleSummaryTextUtil } from "./ruleSummaryUtils.js";
import {
  buildSyncedRule as buildSyncedRuleUtil,
  getRuleSyncValidationError,
} from "./ruleSyncUtils.js";
import { serializeConfigState } from "./configStateSerialization.js";
import {
  formatRunningConfigLogs,
  getRunningConfigName as getRunningConfigNameUtil,
  isConfigRunning,
} from "./runningConfigUtils.js";
import { appendPresetProcesses } from "./processPresetUtils.js";
import { orderConfigSections } from "./configPreviewUtils.js";
import { useDomainWizard } from "./useDomainWizard.js";
import { useConfigImport } from "./useConfigImport.js";
import { useConfigPreview } from "./useConfigPreview.js";
import { useRuleSync } from "./useRuleSync.js";
import { useRunningConfig } from "./useRunningConfig.js";
import { useConfigHistoryActions } from "./useConfigHistoryActions.js";
import { useConfigSectionModes } from "./useConfigSectionModes.js";
import { useItemModalModes } from "./useItemModalModes.js";
import { useItemEditorLifecycle } from "./useItemEditorLifecycle.js";
import { useItemTypeHandlers } from "./useItemTypeHandlers.js";
import { useItemPersistence } from "./useItemPersistence.js";
import { useConfigHistoryData } from "./useConfigHistoryData.js";
import { useConfigEditorState } from "./useConfigEditorState.js";
import { useConfigValidation } from "./useConfigValidation.js";
import { usePlatformEnvironment } from "./usePlatformEnvironment.js";
import { useNodePoolImport } from "./useNodePoolImport.js";
import { useNodePoolCache } from "./useNodePoolCache.js";
import { useConfigNavigation } from "./useConfigNavigation.js";
import { useRunningConfigUpdate } from "./useRunningConfigUpdate.js";
import { useOutboundEditorActions } from "./useOutboundEditorActions.js";
import { useConfigLoader } from "./useConfigLoader.js";
import { useRouteRuleDuplicates } from "./useRouteRuleDuplicates.js";
import {
  getInitialActiveSection as getInitialActiveSectionFromHash,
} from "./configRouteUtils.js";
import { useImportSelections } from "./useImportSelections.js";
import JsonTreeView from "./JsonTreeView.vue";
import RunningConfigModal from "./RunningConfigModal.vue";
import ConfigPreviewModal from "./ConfigPreviewModal.vue";
import ConfigImportModal from "./ConfigImportModal.vue";
import ConfigListPanel from "./ConfigListPanel.vue";
import ConfigEditorHeader from "./ConfigEditorHeader.vue";
import RunningConfigCard from "./RunningConfigCard.vue";
import DomainWizardModal from "./DomainWizardModal.vue";
import ConfigItemEditorModal from "./ConfigItemEditorModal.vue";
import NodePoolImportModal from "./NodePoolImportModal.vue";
import GroupImportModal from "./GroupImportModal.vue";
import RuleSyncModal from "./RuleSyncModal.vue";
import ConfigSectionPanel from "./ConfigSectionPanel.vue";

const sections = [
  "log",
  "dns",
  "inbounds",
  "outbounds",
  "route",
  "experimental",
];

const getInitialActiveSection = () =>
  getInitialActiveSectionFromHash(window.location.hash, sections);

const activeSection = ref(getInitialActiveSection());
const currentConfigId = ref(null);
const activeConfigId = ref(null);
const currentConfigDetail = ref("");
const configList = ref([]);
const showAdvancedRouteFields = ref(false);
const showAdvancedDnsFields = ref(false);

const {
  runningConfig,
  runningConfigModal,
  runningConfigForm,
  loadRunningConfigSettings,
  openRunningConfigModal,
  closeRunningConfigModal,
  copyLogConsole,
  isCurrentConfigRunning,
  saveRunningConfigSettings,
} = useRunningConfig({
  apiBase: API_BASE,
  token,
  currentConfigId,
  sessionSudoPassword,
  setSessionSudoPassword,
  serviceStatus,
  fetchServiceStatus,
  systemModeInfo,
  promptDialog,
  showToast,
});

// 当前运行 subout 服务的宿主机操作系统环境（由 /api/system/info 接口获取，默认预设为 'linux'）

const {
  systemOs,
  isLinux,
  isApplePlatform,
  isWindowsPlatform,
  browserPresets,
  processNamePlaceholder,
  processPathPlaceholder,
  fetchSystemInfo,
} = usePlatformEnvironment({ apiBase: API_BASE, token });
const {
  sectionModes,
  rawJson,
  configData,
  parseLog,
  parseDns,
  parseInbounds,
  parseOutbounds,
  parseRoute,
  parseExperimental,
  serializeLog,
  serializeDns,
  serializeInbounds,
  serializeOutbounds,
  serializeRoute,
  serializeExperimental,
  sectionParsers,
  sectionSerializers,
} = useConfigEditorState({
  isLinux,
  showToast,
  sanitizeOutboundItem,
});

const {
  getFullConfigData,
  validateFullConfigData,
  validateFullConfigWithSingbox,
} = useConfigValidation({
  apiBase: API_BASE,
  token,
  sections,
  sectionModes,
  rawJson,
  sectionSerializers,
  validateData,
  showToast,
});

const {
  duplicateRouteRulesInfo,
  isDuplicateCriteriaItem,
  hasDuplicateInField,
} = useRouteRuleDuplicates({ configData });

const outboundGroups = ref([]);
const nodePoolCache = ref([]);

const { loadNodePoolCache } = useNodePoolCache({
  apiBase: API_BASE,
  token,
  nodePoolCache,
});
const groupImportModal = reactive({
  show: false,
  searchQuery: "",
  selectedTags: [],
});

// ==========================================
// 域名分流推荐 (最佳实践) Wizard Logic
// ==========================================

const {
  domainWizardModal,
  calculateRecommendations,
  sortedOutboundsForSelect,
  matchingExistingRule,
  confirmApplyDomainWizard,
  openDomainWizard,
  startLatencyTest,
} = useDomainWizard({
  configData,
  showToast,
  nodePoolCache,
  loadNodePoolCache,
  apiBase: API_BASE,
  token,
});

const itemModal = reactive({
  show: false,
  title: "",
  jsonText: "",
  error: "",
  onSave: null,
  itemType: "", // 'dns_server', 'dns_rule', 'inbound', 'route_rule', 'route_ruleset', 'outbound'
  mode: "visual",
  itemData: {},
  idx: -1,
  validating: false,
  routeRuleLogic: "standard",
  dnsRuleType: "domain_suffix",
  tempFields: {
    domain: "",
    domain_suffix: "",
    domain_keyword: "",
    domain_regex: "",
    geosite: "",
    geoip: "",
    ip_cidr: "",
    port: "",
    inbound: "",
    rule_set: "",
    protocol: "",
    outbounds: "",
    process_name: "",
    process_path: "",
    process_path_regex: "",
    package_name: "",
    user: "",
  },
});

const presetUrlSelectConfig = ref("http://cp.cloudflare.com/generate_204");
const onPresetUrlChangeConfig = () => {
  if (presetUrlSelectConfig.value !== "custom") {
    itemModal.itemData.url = presetUrlSelectConfig.value;
  } else {
    itemModal.itemData.url = "";
  }
};

const nodePoolModal = reactive({
  show: false,
  nodes: [],
  searchQuery: "",
  selectedIds: [],
});


const { importModal, openImportInEdit, confirmImport } = useConfigImport({
  apiBase: API_BASE,
  token,
  configData,
  rawJson,
  isLinux,
  isApplePlatform,
  parseLog,
  parseDns,
  parseInbounds,
  parseOutbounds,
  parseRoute,
  parseExperimental,
  confirmDialog,
  showToast,
  onImported: () => {
    if (activeSection.value === "preview") previewGeneratedConfig();
  },
});

const { addInbound, editItem } = useItemEditorLifecycle({
  itemModal,
  configData,
  presetUrlSelectConfig,
  ITEM_ARRAY_FIELDS,
  buildItemTempFields,
  mergeLogicalRuleTempFields,
});


const { syncVisualToItemData, setItemModalMode } = useItemModalModes({
  itemModal,
  isLinux,
  ITEM_ARRAY_FIELDS,
  ITEM_ARRAY_FIELDS_WITHOUT_PORT,
  buildItemTempFields,
  buildLogicalRuleCriteria,
  normalizeStandardRuleFields,
  serializeItemDataForSource,
});
const getListByType = (type) => {
  return getConfigItemList(configData, type);
};

const {
  allOutboundTags,
  basicOutbounds,
  batchRemoveGroups,
  batchRemoveProxies,
  editGroupOutbound,
  editProxyOutbound,
  groupOutbounds,
  isAllOutboundGroupsSelected,
  isAllProxiesSelected,
  proxyOutbounds,
  removeSelectedGroupsAndOrphanedProxyNodes,
  selectedGroupTags,
  selectedProxyTags,
  toggleGroupSelection,
  toggleProxySelection,
  toggleSelectAllOutboundGroups,
  toggleSelectAllProxies,
} = useOutboundSelections({
  configData,
  confirmDialog,
  editItem,
  showToast,
});

const {
  editBasicOutbound,
  addBasicOutbound,
  addProxyOutbound,
  confirmRemoveOutbound,
  expandGroupImport,
} = useOutboundEditorActions({
  configData,
  editItem,
  confirmDialog,
  isGroupOutbound,
  removeSelectedGroupsAndOrphanedProxyNodes,
  nodePoolCache,
  sanitizeOutboundItem,
  showToast,
});

const {
  loadConfigList,
  updateConfigSortOrder,
  selectConfig,
  syncLatestResources,
  exportConfigById,
  loadHistoryConfig,
} = useConfigHistoryData({
  apiBase: API_BASE,
  token,
  configList,
  activeConfigId,
  currentConfigId,
  currentConfigDetail,
  rawJson,
  configData,
  outboundGroups,
  nodePoolCache,
  selectedGroupTags,
  selectedProxyTags,
  parseLog,
  parseDns,
  parseInbounds,
  parseOutbounds,
  parseRoute,
  parseExperimental,
  confirmDialog,
  showToast,
  refreshAll: () => loadAllSections(),
});

const {
  isEditing,
  currentPage,
  pageSize,
  paginatedConfigs,
  parseConfigRoute,
  backToList,
  syncFromRoute,
  startEditConfig,
} = useConfigNavigation({
  sections,
  activeSection,
  currentConfigId,
  configList,
  showToast,
  loadNodePoolCache,
  selectConfig,
});

const { loadAllSections } = useConfigLoader({
  apiBase: API_BASE,
  token,
  sections,
  configList,
  currentConfigId,
  currentConfigDetail,
  activeSection,
  isEditing,
  runningConfig,
  rawJson,
  outboundGroups,
  fetchSystemInfo,
  loadRunningConfigSettings,
  loadConfigList,
  parseConfigRoute,
  loadNodePoolCache,
  selectConfig,
  parseLog,
  parseDns,
  parseInbounds,
  parseOutbounds,
  parseRoute,
  parseExperimental,
  showToast,
});

const { setSectionMode, saveVueConfigSection } = useConfigSectionModes({
  apiBase: API_BASE,
  token,
  sectionModes,
  rawJson,
  sectionParsers,
  sectionSerializers,
  validateData,
  showToast,
  loadAllSections,
});

const { saveConfig, saveAsNewConfig, createNewConfigItem, deleteConfigItem, duplicateConfigItem } =
  useConfigHistoryActions({
    apiBase: API_BASE,
    token,
    currentConfigId,
    currentConfigDetail,
    getFullConfigData,
    validateFullConfig: validateFullConfigWithSingbox,
    loadAllSections,
    startEditConfig,
    backToList,
    promptDialog,
    confirmDialog,
    showToast,
  });

const {
  onModalDnsServerTypeChange,
  onInboundTypeChange,
  onRuleSetTypeChange,
  onRouteRuleActionChange,
} = useItemTypeHandlers({
  itemModal,
  isLinux,
  isApplePlatform,
  isWindowsPlatform,
  allOutboundTags,
  normalizeDnsServerForType,
  normalizeInboundForType,
  normalizeRuleSetForType,
  normalizeRouteRuleAction,
});

const {
  availableGroupsToImport,
  clearGroupSearchQuery,
  confirmBatchGroupImport,
  filteredGroupsToImport,
  filteredNodePoolNodes,
  getNodeStatus,
  hasSelectedUpdate,
  invertGroupsSelection,
  invertNodePoolSelection,
  isAllGroupsSelected,
  isAllNodePoolSelected,
  isGroupImported,
  openGroupImport,
  selectableGroupsToImport,
  selectableNodePoolNodes,
  toggleSelectAllGroups,
  toggleSelectAllNodePool,
} = useImportSelections({
  configData,
  outboundGroups,
  groupImportModal,
  nodePoolModal,
  sanitizeOutboundItem,
  expandGroupImport,
  showToast,
});

const { openNodePoolImport, confirmNodePoolImport, importGroup } = useNodePoolImport({
  apiBase: API_BASE,
  token,
  nodePoolModal,
  groupImportModal,
  configData,
  sanitizeOutboundItem,
  expandGroupImport,
  showToast,
});

const getSerializedState = () =>
  serializeConfigState(sections, sectionModes, rawJson, sectionSerializers);

const { saveItem, validateItemModal } = useItemPersistence({
  itemModal,
  configData,
  isLinux,
  syncVisualToItemData,
  sanitizeOutboundItem,
  getOutboundGroupValidationError,
  validateData,
  getListByType,
  getSerializedState,
  apiBase: API_BASE,
  token,
  showToast,
  extractCriteriaFromObj,
  buildItemValidationData,
  ITEM_ARRAY_FIELDS_WITHOUT_PORT,
  getDuplicateItemTagError,
});

const { previewModal, previewGeneratedConfig, copyPreviewToClipboard, exportPreviewFile } =
  useConfigPreview({
    apiBase: API_BASE,
    token,
    getSerializedState,
    orderSections: orderConfigSections,
    showToast,
  });

const getRunningConfigName = (id) => {
  return getRunningConfigNameUtil(configList.value, id);
};

const { triggerUpdateFromDetail } = useRunningConfigUpdate({
  apiBase: API_BASE,
  token,
  currentConfigId,
  currentConfigDetail,
  runningConfig,
  runningConfigForm,
  isCurrentConfigRunning,
  getFullConfigData,
  validateFullConfigWithSingbox,
  loadAllSections,
  openRunningConfigModal,
  saveRunningConfigSettings,
  showToast,
});

const handleHashChange = () => {
  syncFromRoute();
};

onMounted(() => {
  window.addEventListener("hashchange", handleHashChange);
  loadAllSections();
});

onUnmounted(() => {
  window.removeEventListener("hashchange", handleHashChange);
});
const { ruleSyncModal, openSyncModal, confirmSyncRule, getRuleSummaryText } =
  useRuleSync({ configData, allOutboundTags, showToast });

const appendPresetProcess = (procName) => {
  itemModal.tempFields.process_name = appendPresetProcesses(
    itemModal.tempFields.process_name,
    procName,
  );
};

defineExpose({
  editItem,
  appendPresetProcess,
  itemModal,
  saveItem,
  systemOs,
  isLinux,
  browserPresets,
  processNamePlaceholder,
  processPathPlaceholder,
});
</script>

<style src="./ConfigEditorView.css" scoped></style>
