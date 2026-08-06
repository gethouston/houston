import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * PRODUCT-1231: opening a markdown deliverable from chat.
 *
 * Agents end a turn by linking the file they just wrote. Markdown normalizes
 * every link destination through micromark's `normalizeUri`, so a name with a
 * space in it reaches the `a` handler as `Tropical%20Food%20-%20….md`. Handed
 * to the host's download route verbatim that names a file which does not
 * exist, so the preview dialog opened straight into "Couldn't load the file"
 * and titled itself with the escaped text.
 *
 * Seeded through `/__test__/chat-history` + the files import route, so this
 * runs the REAL pipeline end to end: history → Streamdown → the `a` override
 * in `ui/chat` → `useOpenAgentHref` → the download route → the dialog.
 */

const MISSION_ID = "act-product-1231";
const CONVERSATION_ID = `activity-${MISSION_ID}`;
const FILE_NAME = "Tropical Food - Estrategia Integral 90 Dias.md";
const LABEL = "Estrategia Integral de 90 Días";

/** A deliverable with the shapes most likely to escape the modal's bounds. */
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
          // Angle-bracket destination: exactly how a link to a name with
          // spaces is written, and exactly what micromark percent-encodes.
          content: `Documento listo: [${LABEL}](<${FILE_NAME}>)`,
          ts: 2,
        },
      ],
    },
  });
}

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

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // The title is the DECODED name — the regression showed "%20" here.
  await expect(dialog.getByRole("heading", { name: FILE_NAME })).toBeVisible();
  // And the bytes actually loaded: no error card, real rendered markdown.
  await expect(dialog.getByText("Couldn’t load the file")).toHaveCount(0);
  await expect(
    dialog.getByRole("heading", { name: "Estrategia Integral", exact: true }),
  ).toBeVisible();
  // Rendered, not raw source: the heading is a real <h1> and the table is a
  // real <table>, so no "# Estrategia Integral" literal survives.
  await expect(dialog.locator("table")).toBeVisible();
  await expect(dialog.getByText("# Estrategia Integral")).toHaveCount(0);
});

test("previewed markdown never overflows the dialog (PRODUCT-1231)", async ({
  page,
  request,
}) => {
  await seedDeliverable(request);
  await page.goto("/");
  await page.getByText("Estrategia").first().click();
  await page.getByRole("button", { name: LABEL }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("table")).toBeVisible();

  // Nothing inside the dialog may paint past its own box. The dialog is a
  // grid; before the fix an unbreakable word and a nowrap title blew the
  // track out past the surface's max-width and the content bled onto the page.
  const overflow = await dialog.evaluate((root) => {
    const box = root.getBoundingClientRect();
    const escapees: string[] = [];
    for (const el of root.querySelectorAll<HTMLElement>("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // 1px of tolerance for subpixel rounding of borders.
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
