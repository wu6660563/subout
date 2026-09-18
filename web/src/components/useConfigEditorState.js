import { reactive } from "vue";
import {
  parseDns as parseDnsSection,
  parseExperimental as parseExperimentalSection,
  parseInbounds as parseInboundsSection,
  parseLog as parseLogSection,
  parseRoute as parseRouteSection,
  serializeDns as serializeDnsSection,
  serializeExperimental as serializeExperimentalSection,
  serializeInbounds as serializeInboundsSection,
  serializeLog as serializeLogSection,
  serializeOutbounds as serializeOutboundsSection,
  serializeRoute as serializeRouteSection,
} from "./configSectionTransforms.js";
import { normalizeImportedOutbounds } from "./outboundImportUtils.js";

export const useConfigEditorState = ({ isLinux, showToast, sanitizeOutboundItem }) => {
  const sectionModes = reactive({
    log: "visual", dns: "visual", inbounds: "visual",
    outbounds: "visual", route: "visual", experimental: "visual",
  });
  const rawJson = reactive({ log: "", dns: "", inbounds: "", outbounds: "", route: "", experimental: "" });
  const configData = reactive({
    log: { disabled: false, level: "info", timestamp: true, output: "" },
    dns: {
      strategy: "ipv4_only", final: "local-dns", independent_cache: true,
      disable_cache: false, disable_expire: false, reverse_mapping: false,
      client_subnet: "", servers: [], rules: [],
      fakeip: { enabled: false, inet4_range: "", inet6_range: "" },
    },
    inbounds: [], outbounds: [],
    route: { final: "direct", auto_detect_interface: true, default_domain_resolver: "", rules: [], rule_set: [] },
    experimental: {
      cache_file: { enabled: false, path: "", store_fakeip: false, store_rdrc: false },
      clash_api: { enabled: false, external_controller: "", external_ui: "", secret: "", default_mode: "Rule" },
    },
  });

  const parseLog = (json) => parseLogSection(configData, json);
  const parseDns = (json) => parseDnsSection(configData, json);
  const parseInbounds = (json, notifyOnRemove = false) =>
    parseInboundsSection(configData, json, notifyOnRemove, isLinux.value, showToast);
  const parseOutbounds = (json) => {
    configData.outbounds = normalizeImportedOutbounds(json, sanitizeOutboundItem);
  };
  const parseRoute = (json) => parseRouteSection(configData, json);
  const parseExperimental = (json) => parseExperimentalSection(configData, json);
  const serializeLog = () => serializeLogSection(configData);
  const serializeDns = () => serializeDnsSection(configData);
  const serializeInbounds = () => serializeInboundsSection(configData, isLinux.value);
  const serializeOutbounds = () => serializeOutboundsSection(configData, sanitizeOutboundItem);
  const serializeRoute = () => serializeRouteSection(configData);
  const serializeExperimental = () => serializeExperimentalSection(configData);
  const sectionParsers = { log: parseLog, dns: parseDns, inbounds: parseInbounds, outbounds: parseOutbounds, route: parseRoute, experimental: parseExperimental };
  const sectionSerializers = { log: serializeLog, dns: serializeDns, inbounds: serializeInbounds, outbounds: serializeOutbounds, route: serializeRoute, experimental: serializeExperimental };

  return {
    sectionModes, rawJson, configData,
    parseLog, parseDns, parseInbounds, parseOutbounds, parseRoute, parseExperimental,
    serializeLog, serializeDns, serializeInbounds, serializeOutbounds, serializeRoute, serializeExperimental,
    sectionParsers, sectionSerializers,
  };
};
