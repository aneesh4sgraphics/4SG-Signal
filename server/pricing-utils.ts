type PriceFields = {
  dealerPrice?: string | number | null;
  dealer2Price?: string | number | null;
  exportPrice?: string | number | null;
  masterDistributorPrice?: string | number | null;
  retailPrice?: string | number | null;
  approvalNeededPrice?: string | number | null;
  tierStage25Price?: string | number | null;
  tierStage2Price?: string | number | null;
  tierStage15Price?: string | number | null;
  tierStage1Price?: string | number | null;
};

export function hasAnyPrice(item: PriceFields): boolean {
  const prices = [
    item.dealerPrice, item.dealer2Price, item.exportPrice,
    item.masterDistributorPrice, item.retailPrice, item.approvalNeededPrice,
    item.tierStage25Price, item.tierStage2Price, item.tierStage15Price, item.tierStage1Price,
  ];
  return prices.some(p => p != null && parseFloat(String(p)) > 0);
}
