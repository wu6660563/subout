import { computed, ref } from "vue";
import { getBrowserPresets, getProcessNamePlaceholder, getProcessPathPlaceholder } from "./platformPresets.js";

export const usePlatformEnvironment = ({ apiBase, token }) => {
  const systemOs = ref("linux");
  const isLinux = computed(() => systemOs.value === "linux");
  const isApplePlatform = computed(() => ["macos", "darwin"].includes(systemOs.value));
  const isWindowsPlatform = computed(() => systemOs.value === "windows");
  const browserPresets = computed(() => getBrowserPresets(systemOs.value));
  const processNamePlaceholder = computed(() => getProcessNamePlaceholder(systemOs.value));
  const processPathPlaceholder = computed(() => getProcessPathPlaceholder(systemOs.value));

  const fetchSystemInfo = async () => {
    try {
      const response = await fetch(`${apiBase}/api/system/info`, {
        headers: { Authorization: `Bearer ${token.value}` },
      });
      if (response.ok) {
        const data = await response.json();
        if (data?.os) systemOs.value = data.os;
      }
    } catch {
      // 保留 linux 默认值
    }
  };

  return {
    systemOs, isLinux, isApplePlatform, isWindowsPlatform,
    browserPresets, processNamePlaceholder, processPathPlaceholder,
    fetchSystemInfo,
  };
};
