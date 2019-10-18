import harden from '@agoric/harden';

export function makeAutoswap(
  E,
) {


  return harden({
    getAssays,
    getPurses,
    depositPayment,
  });
}
