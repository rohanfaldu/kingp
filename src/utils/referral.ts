export const generateUniqueReferralCode = (name: string): string => {
  const cleanedName = name.replace(/[^a-zA-Z]/g, '').toUpperCase();

  const namePart = (cleanedName.substring(0, 4) + 'XXXX').substring(0, 4);

  let digitPart = '';
  for (let i = 0; i < 4; i++) {
    digitPart += Math.floor(Math.random() * 10);
  }

  return namePart + digitPart;
};
