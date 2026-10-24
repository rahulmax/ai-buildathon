// Money is integer paise everywhere. Rupees only at the edges.

export const toPaise = (rupees: number) => Math.round(rupees * 100)

export const formatINR = (paise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
  }).format(paise / 100)

export const rupeesString = (paise: number) => (paise / 100).toFixed(2)
