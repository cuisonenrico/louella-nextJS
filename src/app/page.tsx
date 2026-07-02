import Link from 'next/link';
import LandingCta from '@/components/landing/LandingCta';

const displayCase = [
  'Pandesal', 'Spanish Bread', 'Ensaymada', 'Pandecoco', 'Putok',
  'Sweet Monay', 'Cinnamon Round', 'Egg Pie', 'Hopia', 'Kababayan',
  'Ube Rolls', 'Mocha Rolls', 'Special Mamon', 'Brownies', 'Banana Loaf',
  'Crinkles',
];

const bakeGroups = [
  {
    time: 'Before dawn',
    blurb: 'The first trays out of the oven are the breakfast breads.',
    items: [
      { name: 'Pandesal', note: 'Hot, pillowy, best by the dozen.' },
      { name: 'Putok', note: 'Dense and sweet with a sugared crown.' },
      { name: 'Sweet Monay', note: 'Soft, rich, and a little chewy.' },
      { name: 'Tasty Loaf', note: 'Sliced white bread for the toaster.' },
    ],
  },
  {
    time: 'Merienda',
    blurb: 'Afternoon breads for coffee, chismis, and the ride home.',
    items: [
      { name: 'Spanish Bread', note: 'Rolled around a buttery filling.' },
      { name: 'Ensaymada', note: 'Soft brioche, sugar and cheese on top.' },
      { name: 'Pandecoco', note: 'A sweet coconut heart inside.' },
      { name: 'Egg Pie', note: 'Silky custard with a burnished top.' },
    ],
  },
  {
    time: 'For the table',
    blurb: 'Rolls and cakes for birthdays, fiestas, and Sunday visits.',
    items: [
      { name: 'Ube Rolls', note: 'Chiffon rolled with real ube.' },
      { name: 'Mocha Cake', note: 'Coffee-kissed layers, round or square.' },
      { name: 'Special Mamon', note: 'Feather-light sponge cups.' },
      { name: 'Brownies', note: 'Dense, fudgy, cut generously.' },
    ],
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-2xl font-semibold italic tracking-tight">
            Louella
          </span>
          <span className="hidden text-xs uppercase tracking-[0.22em] text-muted-foreground sm:inline">
            Panaderya
          </span>
        </div>
        <LandingCta />
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-14 sm:pt-24">
        <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-secondary">
          Baked fresh, every day
        </p>
        <h1 className="max-w-3xl font-display text-5xl font-medium leading-[1.05] tracking-tight sm:text-7xl">
          The ovens are on <em className="text-primary">before the sun is up.</em>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Louella is a neighborhood bakery. Pandesal at dawn, merienda breads in
          the afternoon, and cakes for the table on the days that matter.
        </p>
        <div className="mt-8">
          <Link
            href="#todays-bake"
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-colors hover:bg-foreground/85"
          >
            See the day&apos;s bake
            <span aria-hidden>↓</span>
          </Link>
        </div>
      </section>

      {/* Display-case band */}
      <div className="overflow-hidden border-y bg-accent/60 py-3" aria-hidden>
        <div className="flex w-max animate-marquee gap-0">
          {[0, 1].map((copy) => (
            <ul key={copy} className="flex shrink-0 items-center">
              {displayCase.map((name) => (
                <li
                  key={`${copy}-${name}`}
                  className="flex items-center whitespace-nowrap px-4 font-display text-sm italic text-accent-foreground"
                >
                  {name}
                  <span className="ml-8 text-primary">·</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      {/* The day's bake */}
      <section id="todays-bake" className="mx-auto max-w-6xl scroll-mt-10 px-6 py-20">
        <h2 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">
          The day&apos;s bake
        </h2>
        <p className="mt-3 max-w-lg text-muted-foreground">
          A panaderya runs on rhythm. Here is ours, from the first trays to the
          last box tied with string.
        </p>

        <div className="mt-12 space-y-16">
          {bakeGroups.map((group) => (
            <div key={group.time} className="grid gap-6 md:grid-cols-[220px_1fr]">
              <div>
                <h3 className="font-display text-xl font-medium italic text-primary">
                  {group.time}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {group.blurb}
                </p>
              </div>
              <ul className="grid gap-4 sm:grid-cols-2">
                {group.items.map((item) => (
                  <li
                    key={item.name}
                    className="rounded-xl border bg-card p-5 shadow-[0_1px_0_hsl(var(--border))]"
                  >
                    <p className="font-display text-lg font-medium">{item.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.note}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-foreground text-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-xl font-medium italic">Louella</p>
            <p className="mt-1 text-sm text-background/70">
              Baked fresh, every day.
            </p>
          </div>
          <Link
            href="/login"
            className="text-sm text-background/70 underline-offset-4 transition-colors hover:text-background hover:underline"
          >
            Staff login
          </Link>
        </div>
      </footer>
    </div>
  );
}
