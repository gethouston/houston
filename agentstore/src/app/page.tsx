import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@houston-ai/core";
import { Boxes, Download, Sparkles, Upload } from "lucide-react";
import { siteConfig } from "@/lib/site-config";

const features = [
  {
    icon: Upload,
    title: "Publish in one step",
    body: "Share an agent straight from Houston. It gets a link, a page, and a manage token you keep.",
  },
  {
    icon: Download,
    title: "Install anywhere",
    body: "Anyone can copy the instructions, export a Claude Skill, or open the agent directly in Houston.",
  },
  {
    icon: Sparkles,
    title: "No code, no terminal",
    body: "Every agent is plain language and skills. Built for people, not just engineers.",
  },
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center px-6 py-24">
      <Badge variant="secondary" className="mb-6 gap-1.5">
        <Boxes className="size-3.5" />
        {siteConfig.name}
      </Badge>

      <h1 className="max-w-3xl text-center font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
        A catalog of AI agents you can install in one click
      </h1>

      <p className="mt-6 max-w-2xl text-center text-lg text-muted-foreground text-pretty">
        {siteConfig.description} Publish the agents you build in Houston, then
        let anyone discover and run them.
      </p>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Button size="lg">Browse agents</Button>
        <Button size="lg" variant="outline">
          Publish yours
        </Button>
      </div>

      <div className="mt-20 grid w-full gap-4 sm:grid-cols-3">
        {features.map(({ icon: Icon, title, body }) => (
          <Card key={title} className="h-full">
            <CardHeader>
              <div className="mb-2 flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-5" />
              </div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{body}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </main>
  );
}
