import { expect, test } from "@playwright/test";

test("可以在空白底图上添加并编辑中文标签", async ({ page }) => {
  await page.goto("/?basemap=blank&fresh=1");
  await expect(page.getByTestId("map-canvas")).toHaveAttribute("data-ready", "true");
  await page.getByTestId("tool-label").click();
  const box = await page.getByTestId("map-canvas").boundingBox();
  if (!box) throw new Error("地图画布不存在");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId("layer-list")).toContainText("新标签");
  const field = page.getByTestId("label-text");
  await field.fill("测试点");
  await field.blur();
  await expect(page.getByTestId("map-label")).toContainText("测试点");
});

test("可以用 Terra Draw 绘制折线并修改颜色", async ({ page }) => {
  await page.goto("/?basemap=blank&fresh=1");
  await expect(page.getByTestId("map-canvas")).toHaveAttribute("data-ready", "true");
  await page.getByTestId("tool-draw").click();
  const box = await page.getByTestId("map-canvas").boundingBox();
  if (!box) throw new Error("地图画布不存在");
  await page.mouse.click(box.x + 140, box.y + 180);
  await page.mouse.click(box.x + 260, box.y + 220);
  await page.mouse.click(box.x + 380, box.y + 160);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("layer-list")).toContainText("手绘路段");
  await page.getByTestId("road-color").fill("#22c55e");
  await expect(page.getByTestId("road-width")).toBeVisible();
});
