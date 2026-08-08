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
            // A LABELED file link and a BARE one: one action, so one look.
            "Listo: [Perfil](perfil.md)",
            "Y el [reporte](informes/Q3%20reporte.pdf).",
            "Referencia: [el informe](https://example.com/report)",
            // Unescaped spaces: not a link per CommonMark, repaired from text.
            "Trimestre: [informe trimestral](informes/Q3 reporte.pdf)",
            // Prose that merely LOOKS like a link must stay prose.
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

  // Every chip carries the file's full path as its title — the affordance
  // follows the DESTINATION, not the label shape. And every chip shows an
  // EXTENSION, so a reader can never mistake a .pdf for a .md: the agent's
  // label gains the real one rather than hiding it.
  await expect(perfil).toHaveAttribute("title", "perfil.md");
  await expect(
    page.getByRole("button", { name: "reporte.pdf", exact: true }),
  ).toHaveAttribute("title", "informes/Q3 reporte.pdf");

  // Repaired from plain text: CommonMark refuses a destination with unescaped
  // spaces, so this used to reach the reader as literal `[…](…)` noise.
  await expect(
    page.getByRole("button", { name: "informe trimestral.pdf" }),
  ).toHaveAttribute("title", "informes/Q3 reporte.pdf");

  // ...but the repair must never eat ordinary prose. No extension in the
  // destination means it was never a file reference.
  await expect(
    page.getByText("[ver la nota](un aparte mas largo)"),
  ).toBeVisible();

  // A file never wears the web link's clothes. Since HOU-1152 every URL is the
  // same `Autolink` anchor on the reserved link tint, so the file chip must be
  // neither an anchor nor blue — that contrast is what tells the reader whether
  // a click leaves Houston.
  const fileChip = page.getByRole("button", { name: "Perfil.md" });
  await expect(fileChip).toHaveJSProperty("tagName", "BUTTON");
  const chipBackground = await fileChip.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  // bg-link/10 is the link tint's signature (Tailwind emits it via oklab, so
  // assert on the alpha rather than a colour-space-dependent literal).
  expect(chipBackground).not.toMatch(/\/ 0\.1\)$/);

  // The web link beside it IS the blue anchor chip, unchanged.
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

test("the preview grows to full screen and shrinks back (PRODUCT-1231)", async ({
  page,
  request,
}) => {
  await seedDeliverable(request);
  await page.goto("/");
  await page.getByText("Estrategia").first().click();
  await page.getByRole("button", { name: LABEL }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("table")).toBeVisible();
  const compact = (await dialog.boundingBox())?.width ?? 0;

  // A long document is unreadable through a 60vh porthole, so the reader can
  // claim the viewport — and get the small window back.
  await dialog.getByRole("button", { name: "Expand" }).click();
  await expect(dialog.getByRole("button", { name: "Shrink" })).toBeVisible();
  // Poll rather than sample once, same as the shrink leg below: the toggle
  // flips before the 200ms width transition has settled, so a single sample
  // can still read the compact width.
  await expect
    .poll(async () => (await dialog.boundingBox())?.width ?? 0)
    .toBeGreaterThan(compact);

  // Expanding must not clip what it was expanded to show: the frame still
  // scrolls, it is only taller.
  const scrollable = await dialog
    .locator("div.overflow-y-auto")
    .first()
    .evaluate((el) => getComputedStyle(el).overflowY);
  expect(scrollable).toBe("auto");

  // Poll rather than sample once: the surface animates back over the dialog's
  // 200ms transition, so the toggle flips before the box has settled.
  await dialog.getByRole("button", { name: "Shrink" }).click();
  await expect(dialog.getByRole("button", { name: "Expand" })).toBeVisible();
  await expect
    .poll(async () => Math.round((await dialog.boundingBox())?.width ?? 0))
    .toBe(Math.round(compact));
});
