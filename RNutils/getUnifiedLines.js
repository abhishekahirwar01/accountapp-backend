// utils/getUnifiedLines.js
function getUnifiedLines(tx, serviceNameById) {
  const out = [];

  const num = (n, d = 0) => {
    if (n == null || n === "") return d;
    const parsed = Number(n);
    return isNaN(parsed) ? d : parsed;
  };

  const pushRow = (row, itemType) => {
    const isService = itemType === "service";

    const name =
      row.name ??
      row.productName ??
      (row.product && typeof row.product === "object"
        ? row.product.name
        : undefined) ??
      (isService
        ? row.serviceName ??
          (row.service && typeof row.service === "object"
            ? row.service.serviceName
            : undefined) ??
          (row.service ? serviceNameById?.get(String(row.service)) : undefined)
        : undefined) ??
      "Item";

    const quantity = isService ? 1 : num(row.quantity, 1);
    const amount = num(row.amount) || num(row.pricePerUnit) * quantity;

    const pricePerUnit =
      num(row.pricePerUnit) || (quantity > 0 ? amount / quantity : 0);

    let unit = "piece";

    if (row.unitType === "Other" && row.otherUnit) {
      unit = row.otherUnit;
    } else if (row.unitType) {
      unit = row.unitType;
    } else if (row.unit) {
      unit = row.unit;
    } else if (row.unitName) {
      unit = row.unitName;
    }

    const gstPercentage = num(row.gstPercentage);
    const lineTax = num(row.lineTax);
    const lineTotal = num(row.lineTotal) || amount + lineTax;

    out.push({
      itemType,
      name,
      description: row.description || "",
      quantity,
      unit,
      pricePerUnit,
      amount,
      gstPercentage: gstPercentage > 0 ? gstPercentage : undefined,
      lineTax: lineTax > 0 ? lineTax : undefined,
      lineTotal: lineTotal > 0 ? lineTotal : amount,
      code: isService ? row.sac : row.hsn
    });
  };

  if (Array.isArray(tx.products)) {
    tx.products.forEach((p) => pushRow(p, "product"));
  }

  if (Array.isArray(tx.services)) {
    tx.services.forEach((s) => pushRow(s, "service"));
  }

  if (Array.isArray(tx.service)) {
    tx.service.forEach((s) => pushRow(s, "service"));
  }

  if (out.length === 0) {
    const amount = num(tx.amount);
    const gstPercentage = num(tx.gstPercentage);
    const lineTax = num(tx.lineTax) || (amount * gstPercentage) / 100;
    const lineTotal = num(tx.totalAmount) || amount + lineTax;

    out.push({
      itemType: "service",
      name: tx.description || "Item",
      description: "",
      quantity: 1,
      pricePerUnit: amount,
      amount,
      gstPercentage: gstPercentage > 0 ? gstPercentage : undefined,
      lineTax: lineTax > 0 ? lineTax : undefined,
      lineTotal,
      code: undefined
    });
  }

  return out;
}

module.exports = { getUnifiedLines };
