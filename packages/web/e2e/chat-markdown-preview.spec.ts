import { FAKE_HOST_URL } from "@houston/fake-host";
import { FOLLOW_UP_PLACEHOLDER } from "./support/composer";
import { expect, test } from "./support/fixtures";

const MISSION_ID = "act-product-1231";
const CONVERSATION_ID = `activity-${MISSION_ID}`;
const FILE_NAME = "Tropical Food - Estrategia Integral 90 Dias.md";
const LABEL = "Estrategia Integral de 90 Días";

const MARKDOWN = `# Estrategia Integral

Un **plan** de 90 días con [un enlace](https://example.com/plan).

## Fases

| Fase | Objetivo | Métrica |
| --- | --- | --- |
| 1 | Auditoría | Cobertura |
| 2 | Contenido | Alcance |

- Embudo completo desde contenido hasta recompra.
- Plan trimestral con operación asistida por IA.

SupercalifragilisticoUnaPalabraLarguisimaQueNoSePuedeCortarEnNingunLadoJamasDeLosJamases

\`\`\`bash
echo "una linea de codigo francamente muy larga que se extiende bastante mas alla del ancho del modal"
\`\`\`
`;

async function seedDeliverable(request: {
  post: (url: string, opts: { data: unknown }) => Promise<unknown>;
}) {
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: { id: MISSION_ID, title: "Estrategia", status: "needs_you" },
  });
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/files/import`, {
    data: {
      files: [
        {
          name: FILE_NAME,
          contentBase64: Buffer.from(MARKDOWN, "utf8").toString("base64"),
        },
      ],
    },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/chat-history`, {
    data: {
      conversationId: CONVERSATION_ID,
      messages: [
        { role: "user", content: "hazme la estrategia", ts: 1 },
        {
          role: "assistant",
          content: `Documento listo: [${LABEL}](<${FILE_NAME}>)`,
          ts: 2,
        },
      ],
    },
  });
}

test("every file link renders as one file chip, whatever shape the agent wrote (PRODUCT-1231)", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: { id: "act-chips", title: "Chips", status: "needs_you" },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/chat-history`, {
    data: {
      conversationId: "activity-act-chips",
      messages: [
        { role: "user", content: "go", ts: 1 },
        {
          role: "assistant",
          content: [
            "Listo: [Perfil](perfil.md)",
            "Y el [reporte](informes/Q3%20reporte.pdf).",
            "Referencia: [el informe](https://example.com/report)",
            "Trimestre: [informe trimestral](informes/Q3 reporte.pdf)",
            "Prosa: [ver la nota](un aparte mas largo) intacta.",
          ].join("\n\n"),
          ts: 2,
        },
      ],
    },
  });

  await page.goto("/");
  await page.getByText("Chips").first().click();
  const perfil = page.getByRole("button", { name: "Perfil.md" });
  await expect(perfil).toBeVisible({ timeout: 15_000 });

  await expect(perfil).toHaveAttribute("title", "perfil.md");
  await expect(
    page.getByRole("button", { name: "reporte.pdf", exact: true }),
  ).toHaveAttribute("title", "informes/Q3 reporte.pdf");

  await expect(
    page.getByRole("button", { name: "informe trimestral.pdf" }),
  ).toHaveAttribute("title", "informes/Q3 reporte.pdf");

  await expect(
    page.getByText("[ver la nota](un aparte mas largo)"),
  ).toBeVisible();

  const fileChip = page.getByRole("button", { name: "Perfil.md" });
  await expect(fileChip).toHaveJSProperty("tagName", "BUTTON");
  const chipBackground = await fileChip.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  expect(chipBackground).not.toMatch(/\/ 0\.1\)$/);

  const webLink = page.locator('a[href="https://example.com/report"]');
  await expect(webLink).toBeVisible();
  const linkBackground = await webLink.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  expect(linkBackground).toMatch(/\/ 0\.1\)$/);
});

test("a markdown file whose name has spaces previews as rendered prose (PRODUCT-1231)", async ({
  page,
  request,
}) => {
  await seedDeliverable(request);
  await page.goto("/");
  await page.getByText("Estrategia").first().click();

  const pill = page.getByRole("button", { name: LABEL });
  await expect(pill).toBeVisible({ timeout: 15_000 });
  await pill.click();

  const dialog = page.getByRole("region", { name: `Preview of ${FILE_NAME}` });
  await expect(dialog).toBeVisible();

  await expect(dialog.getByRole("heading", { name: FILE_NAME })).toBeVisible();
  await expect(dialog.getByText("Couldn’t load the file")).toHaveCount(0);
  await expect(
    dialog.getByRole("heading", { name: "Estrategia Integral", exact: true }),
  ).toBeVisible();
  await expect(dialog.locator("table")).toBeVisible();
  await expect(dialog.getByText("# Estrategia Integral")).toHaveCount(0);
});

test("previewed markdown never overflows the panel (PRODUCT-1231)", async ({
  page,
  request,
}) => {
  await seedDeliverable(request);
  await page.goto("/");
  await page.getByText("Estrategia").first().click();
  await page.getByRole("button", { name: LABEL }).click();

  const dialog = page.getByRole("region", { name: `Preview of ${FILE_NAME}` });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("table")).toBeVisible();

  const overflow = await dialog.evaluate((root) => {
    const box = root.getBoundingClientRect();
    const escapees: string[] = [];
    for (const el of root.querySelectorAll<HTMLElement>("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > box.right + 1 || r.left < box.left - 1) {
        escapees.push(`${el.tagName}:${el.className}`);
      }
    }
    return {
      escapees: escapees.slice(0, 5),
      scrollsSideways: root.scrollWidth > root.clientWidth + 1,
      width: box.width,
      viewport: document.documentElement.clientWidth,
    };
  });

  expect(overflow.escapees).toEqual([]);
  expect(overflow.scrollsSideways).toBe(false);
  expect(overflow.width).toBeLessThanOrEqual(overflow.viewport);
});

test("the preview takes the whole row and gives the chat back (PRODUCT-1231)", async ({
  page,
  request,
}) => {
  await seedDeliverable(request);
  await page.goto("/");
  await page.getByText("Estrategia").first().click();
  await page.getByRole("button", { name: LABEL }).click();

  const panel = page.getByRole("region", { name: `Preview of ${FILE_NAME}` });
  await expect(panel.locator("table")).toBeVisible();
  const beside = (await panel.boundingBox())?.width ?? 0;
  const composer = page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER);
  await expect(composer).toBeVisible();

  await panel.getByRole("button", { name: "Expand" }).click();
  await expect(composer).toBeHidden();
  await expect
    .poll(async () => (await panel.boundingBox())?.width ?? 0)
    .toBeGreaterThan(beside);
  const scrollable = await panel
    .locator("div.overflow-y-auto")
    .first()
    .evaluate((el) => getComputedStyle(el).overflowY);
  expect(scrollable).toBe("auto");

  await panel.getByRole("button", { name: "Show the chat beside it" }).click();
  await expect(composer).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(composer).toBeVisible();
});
