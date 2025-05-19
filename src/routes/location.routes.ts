import express, { Request, Response } from 'express';
import { readJsonFile } from '../utils/readJsonFile';
import { Prisma, PrismaClient } from '@prisma/client';


const router = express.Router();
const prisma = new PrismaClient();



// router.post('/allLocations', async (req: Request, res: Response) => {
//     try {
//         const allLocationData = await readJsonFile();
//         console.log(allLocationData.name, '>>>>>>>>>>>>>>>>> Name');
//         allLocationData.states.map((stateData: any) => {
//             console.log(stateData.name, '>>>>>>>>>>>>>>>>> stateData Name');
//             stateData.cities.map((cityData: any) => {
//                 console.log(cityData.name, '>>>>>>>>>>>>>>>>> cittyData Name');
//             })
//         });

//         res.json({ success: true, message: 'All Location data get Successfully', data: allLocationData });
//     } catch (error) {
//         res.status(500).json({ success: false, message: 'Failed to load location data', data: null });
//     }
// });



// router.post('/allLocations', async (req: Request, res: Response) => {
//     try {
//         const allLocationData = await readJsonFile();

//         const statesWithCities = allLocationData.states.map((stateData: any) => {
//             return {
//                 stateName: stateData.name,
//                 countryId: allLocationData.id,
//                 status: allLocationData.status,
//                 cities: stateData.cities.map((cityData: any) => ({
//                     cityName: cityData.name,
//                     stateId: stateData.id,
//                     status: allLocationData.status,

//                 })),
//             };
//         });

//         res.json({
//             success: true,
//             message: 'All Location data get Successfully',
//             data: {
//                 countryName: allLocationData.name,
//                 states: statesWithCities,
//             },
//         });
//     } catch (error) {
//         res.status(500).json({ success: false, message: 'Failed to load location data', data: null });
//     }
// });



router.post('/allLocations', async (_req: Request, res: Response) => {
  try {
    const allLocationData = await readJsonFile();

    // 1. Get country from DB by name
    const existingCountry = await prisma.country.findFirst({
      where: { name: allLocationData.name },
    });

    if (!existingCountry) {
      return res.status(404).json({
        success: false,
        message: 'Country not found in database',
        data: null,
      });
    }

    const statesWithCities = [];

    // 2. Loop through states and create them if they don't exist
    for (const stateData of allLocationData.states) {
      // Try to find existing state
      let state = await prisma.state.findFirst({
        where: {
          name: stateData.name,
          countryId: existingCountry.id,
        },
      });

      // If state doesn't exist, create it
      if (!state) {
        state = await prisma.state.create({
          data: {
            name: stateData.name,
            countryId: existingCountry.id,
            // Convert to boolean if it's a string
            status: allLocationData.status === "true" ? true : 
                   allLocationData.status === "false" ? false : 
                   Boolean(allLocationData.status) || true
          },
        });
      }

      const citiesData = [];
      
      // 3. Process cities for this state
      for (const cityData of stateData.cities) {
        // Try to find existing city
        let city = await prisma.city.findFirst({
          where: {
            name: cityData.name,
            stateId: state.id,
          },
        });

        // If city doesn't exist, create it
        if (!city) {
          city = await prisma.city.create({
            data: {
              name: cityData.name,
              stateId: state.id,
              // Convert to boolean if it's a string
              status: allLocationData.status === "true" ? true : 
                     allLocationData.status === "false" ? false : 
                     Boolean(allLocationData.status) || true
            },
          });
        }

        citiesData.push({
          cityName: city.name,
        //   cityId: city.id,
          stateId: state.id,
          status: city.status,
        });
      }

      statesWithCities.push({
        stateName: state.name,
        // stateId: state.id,
        countryId: existingCountry.id,
        status: state.status,
        cities: citiesData,
      });
    }

    res.json({
      success: true,
      message: 'All Location data processed successfully',
      data: {
        countryName: existingCountry.name,
        countryId: existingCountry.id,
        states: statesWithCities,
      },
    });
  } catch (error: any) {
    console.error('Error processing location data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process location data',
      error: error.message || String(error),
    });
  }
});;







export default router;

