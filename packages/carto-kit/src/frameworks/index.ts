import {
  ASTRO_FRAMEWORK,
  isAstroProject,
  prepareAstroCloudflareBuild,
  type AstroBuildPreparation,
  type PrepareOptions
} from "./astro.js";

export const INSTALLED_FRAMEWORKS = [ASTRO_FRAMEWORK] as const;
export type FrameworkName = typeof INSTALLED_FRAMEWORKS[number];
export type FrameworkBuildPreparation = AstroBuildPreparation;

export async function resolveFramework(
  root: string,
  packageJson: Record<string, unknown>,
  configured?: string
): Promise<FrameworkName> {
  if (configured !== undefined) {
    if (isFrameworkName(configured)) return configured;
    throw new Error(`Unsupported framework "${configured}". Installed adapters: ${INSTALLED_FRAMEWORKS.join(", ")}.`);
  }
  if (await isAstroProject(root, packageJson)) return ASTRO_FRAMEWORK;
  throw new Error(
    "No deployment framework is configured. Add framework to carto.config.json; " +
    `installed adapters: ${INSTALLED_FRAMEWORKS.join(", ")}.`
  );
}

export async function prepareFrameworkCloudflareBuild(
  framework: FrameworkName,
  options: PrepareOptions
): Promise<FrameworkBuildPreparation> {
  switch (framework) {
    case ASTRO_FRAMEWORK:
      return await prepareAstroCloudflareBuild(options);
  }
}

export function isFrameworkName(value: string): value is FrameworkName {
  return (INSTALLED_FRAMEWORKS as readonly string[]).includes(value);
}
