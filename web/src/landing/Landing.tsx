import { COMPARATOR_PATH, SITE_NAME } from "../site";

/** Placeholder until the designed landing page lands (docs/design/landing/Main.dc.html). */
export function Landing() {
  return (
    <main>
      <h1>{SITE_NAME}</h1>
      <p>
        <a href={COMPARATOR_PATH}>Look at the sky</a>
      </p>
    </main>
  );
}
