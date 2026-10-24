// @ts-check

import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

// English lives at the root (/), Spanish under /es/. Every page exists in both.
export default defineConfig({
  site: "https://academy.gethouston.ai",
  integrations: [
    starlight({
      title: { en: "Houston Academy", es: "Houston Academy" },
      description:
        "From zero to hero: build real software with AI agents, without writing code.",
      defaultLocale: "root",
      locales: {
        root: { label: "English", lang: "en" },
        es: { label: "Español", lang: "es" },
      },
      logo: { src: "./src/assets/houston-icon.png", alt: "Houston" },
      favicon: "/favicon.png",
      customCss: ["./src/styles/houston.css"],
      head: [
        {
          tag: "link",
          attrs: { rel: "preconnect", href: "https://api.fontshare.com" },
        },
        {
          tag: "link",
          attrs: {
            rel: "stylesheet",
            href: "https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap",
          },
        },
      ],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/gethouston/houston/tree/main/academy",
        },
      ],
      sidebar: [
        {
          label: "Start here",
          translations: { es: "Empieza aquí" },
          items: [
            {
              slug: "start",
              label: "How the Academy works",
              translations: { es: "Cómo funciona la Academy" },
            },
            {
              slug: "start/program",
              label: "The program",
              translations: { es: "El programa" },
            },
          ],
        },
        {
          label: "Course 0 · Hello, internet",
          translations: { es: "Curso 0 · Hola, internet" },
          items: [{ autogenerate: { directory: "course-0" } }],
        },
        {
          label: "Course 1 · How software works",
          translations: { es: "Curso 1 · Cómo funciona el software" },
          items: [{ autogenerate: { directory: "course-1" } }],
        },
        {
          label: "Course 2 · Think like a builder",
          translations: { es: "Curso 2 · Piensa como constructor" },
          items: [{ autogenerate: { directory: "course-2" } }],
        },
        {
          label: "Reference",
          translations: { es: "Referencia" },
          items: [
            {
              slug: "glossary",
              label: "Glossary",
              translations: { es: "Glosario" },
            },
          ],
        },
      ],
    }),
  ],
});
