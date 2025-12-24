import { PrismaClient } from "@prisma/client";
import { readJsonFile } from "../utils/readJsonFile";

const prisma = new PrismaClient();

async function main() {
  const countries = await readJsonFile();

  for (const country of countries) {
    // ── COUNTRIES ───────────────────────
    let dbCountry = await prisma.country.findFirst({
      where: {
        OR: [
          { name: country.name },
          { countryCode: country.iso3 } // check unique constraint
        ]
      }
    });

    if (!dbCountry) {
      dbCountry = await prisma.country.create({
        data: {
          name: country.name,
          countryCode: country.iso3
        }
      });
      console.log(`Inserted NEW Country: ${dbCountry.name}`);
    } else {
      console.log(`Existing Country skipped: ${dbCountry.name}`);
    }

    // ── STATES ─────────────────────────
    if (!country.states?.length) continue;

    for (const state of country.states) {
      let dbState = await prisma.state.findFirst({
        where: {
          name: state.name,
          countryId: dbCountry.id
        }
      });

      if (!dbState) {
        dbState = await prisma.state.create({
          data: {
            name: state.name,
            countryId: dbCountry.id
          }
        });
        console.log(`  Inserted NEW State: ${dbState.name}`);
      } else {
        console.log(`  Existing State skipped: ${dbState.name}`);
      }

      // ── CITIES ─────────────────────
      if (!state.cities?.length) continue;

      for (const city of state.cities) {
        const dbCity = await prisma.city.findFirst({
          where: {
            name: city.name,
            stateId: dbState.id
          }
        });

        if (!dbCity) {
          await prisma.city.create({
            data: {
              name: city.name,
              stateId: dbState.id
            }
          });
          console.log(`    Inserted NEW City: ${city.name}`);
        } else {
          console.log(`    Existing City skipped: ${dbCity.name}`);
        }
      }
    }
  }

  console.log("✔✔ IMPORT COMPLETE — EXISTING DATA PRESERVED ✔✔");
}

main()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
