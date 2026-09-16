import { computed } from "vue";
import {
  buildDuplicateRouteRulesInfo,
  hasDuplicateInField as hasDuplicateInFieldUtil,
  isDuplicateCriteriaItem as isDuplicateCriteriaItemUtil,
} from "./routeRuleDuplicateUtils.js";

export const useRouteRuleDuplicates = ({ configData }) => {
  const duplicateRouteRulesInfo = computed(() => buildDuplicateRouteRulesInfo(configData));
  const isDuplicateCriteriaItem = (category, rawValue) =>
    isDuplicateCriteriaItemUtil(duplicateRouteRulesInfo.value, category, rawValue);
  const hasDuplicateInField = (category, fieldValue) =>
    hasDuplicateInFieldUtil(duplicateRouteRulesInfo.value, category, fieldValue);
  return { duplicateRouteRulesInfo, isDuplicateCriteriaItem, hasDuplicateInField };
};
