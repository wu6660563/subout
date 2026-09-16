// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import ExperimentalConfigEditor from "./ExperimentalConfigEditor.vue";

describe("ExperimentalConfigEditor", () => {
  it("renders and updates cache and Clash API settings", async () => {
    const configData = reactive({
      experimental: {
        cache_file: {
          enabled: false,
          path: "",
          store_fakeip: false,
          store_rdrc: false,
        },
        clash_api: {
          enabled: false,
          external_controller: "",
          secret: "",
          external_ui: "",
          default_mode: "rule",
        },
      },
    });
    const wrapper = mount(ExperimentalConfigEditor, {
      props: { configData },
    });

    const checkboxes = wrapper.findAll("input[type='checkbox']");
    await checkboxes[0].setValue(true);
    expect(configData.experimental.cache_file.enabled).toBe(true);
    await wrapper.findAll("input[type='text']").at(0).setValue("cache.db");
    expect(configData.experimental.cache_file.path).toBe("cache.db");

    await checkboxes[1].setValue(true);
    expect(configData.experimental.clash_api.enabled).toBe(true);
    await wrapper.findAll("input[type='text']").at(1).setValue("127.0.0.1:9090");
    expect(configData.experimental.clash_api.external_controller).toBe(
      "127.0.0.1:9090",
    );
  });
});
