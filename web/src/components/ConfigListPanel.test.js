// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ConfigListPanel from "./ConfigListPanel.vue";

const config = {
  id: 7,
  detail: "主配置",
  sort_order: 1,
  created_at: "2026-01-01 00:00:00",
  updated_at: "2026-01-02 00:00:00",
};

describe("ConfigListPanel", () => {
  it("renders config rows and emits row actions", async () => {
    const wrapper = mount(ConfigListPanel, {
      props: {
        configList: [config],
        paginatedConfigs: [config],
        currentPage: 1,
        pageSize: 10,
      },
    });

    expect(wrapper.text()).toContain("主配置");
    expect(wrapper.text()).toContain("同步最新资源");

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "编辑配置")
      .trigger("click");

    expect(wrapper.emitted("edit")).toEqual([[7]]);
  });

  it("emits page size and sort order changes", async () => {
    const wrapper = mount(ConfigListPanel, {
      props: {
        configList: [config],
        paginatedConfigs: [config],
        currentPage: 1,
        pageSize: 10,
      },
    });

    await wrapper.find("input[aria-label='配置排序值']").setValue("3");
    await wrapper.find("input[aria-label='配置排序值']").trigger("change");
    expect(wrapper.emitted("update-sort-order").at(-1)).toEqual([config]);

    await wrapper.find("select").setValue("20");
    expect(wrapper.emitted("update:page-size")).toEqual([[20]]);
  });
});
