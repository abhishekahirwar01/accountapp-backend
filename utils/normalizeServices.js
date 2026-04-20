// utils/normalizeServices.js
const Service = require("../models/Service");
const AdditionalService = require("../models/AdditionalService");

module.exports = async function normalizeServices(rows, clientId) {
  const items = [];
  let computedTotal = 0;
  let computedTax = 0;

  for (const r of rows || []) {
    const id = r.service;
    if (!id) continue;

    const isAdditionalService = !!r.isAdditionalService;

    let svc = null;
    if (isAdditionalService) {
      svc = await AdditionalService.findOne({
        _id: id,
        createdByClient: clientId,
      })
        .select("_id serviceName serviceCost additionalCharges totalAmount description")
        .lean();
    } else {
      svc = await Service.findOne({
        _id: id,
        createdByClient: clientId,
      })
        .select("_id gstPercentage sac amount")
        .lean();
    }

    if (!svc) continue;

    // Calculate amount based on service type
    let amount = 0;
    
    if (isAdditionalService) {
      // For additional services
      amount = Number(
        r.amount ??
          r.fixedCharges ??
          svc.totalAmount ??
          (Number(svc.serviceCost || 0) + Number(svc.additionalCharges || 0))
      ) || 0;
    } else {
      // For regular services - use explicit amount if provided from frontend
      const explicitAmount = Number(r.amount);
      if (explicitAmount > 0) {
        amount = explicitAmount;
      } else {
        // Calculate from quantity and pricePerUnit if no explicit amount
        const quantity = Number(r.quantity) || 1;
        const pricePerUnit = Number(r.pricePerUnit) || Number(svc.amount) || 0;
        const grossAmount = quantity * pricePerUnit;
        
        // Apply discount if any
        const discountType = r.discountType || 'fixed';
        const discountValue = Number(r.discountValue) || 0;
        
        let discountAmount = 0;
        if (discountType === 'percentage') {
          discountAmount = (grossAmount * discountValue) / 100;
        } else {
          discountAmount = discountValue;
        }
        discountAmount = Math.min(discountAmount, grossAmount);
        
        amount = grossAmount - discountAmount;
      }
    }

    if (amount <= 0) continue; // Skip services with non-positive amount

    const fixedCharges = isAdditionalService ? amount : (Number(r.fixedCharges) || 0);
    const variableQty = Number(r.variableQty ?? 0) || 0;
    const variableUnit = String(r.variableUnit || r.unitType || "Km");
    const variableRate = Number(r.variableRate ?? 0) || 0;
    const computedVariableTotal = Number((variableQty * variableRate).toFixed(2));
    const variableCharges =
      r.variableCharges !== undefined && r.variableCharges !== null
        ? Number(r.variableCharges) || 0
        : computedVariableTotal;

    const description = r.description || (isAdditionalService ? svc.description || "" : "");

    // Get GST percentage from the request or use service default
    const gstPercentage = Number(
      r.gstPercentage ??
        (!isAdditionalService ? svc.gstPercentage : 0) ??
        0
    );
    const lineTax = +(amount * gstPercentage / 100).toFixed(2);
    const lineTotal = +(amount + lineTax).toFixed(2);

    const normalized = {
      service: svc._id,
      serviceModel: isAdditionalService ? "AdditionalService" : "Service",
      isAdditionalService,
      amount,                  // ✅ discounted amount
      serviceName: isAdditionalService
        ? r.serviceName || svc.serviceName || ""
        : r.serviceName || "",
      description,
      gstPercentage,
      lineTax,
      lineTotal,
      sac: isAdditionalService ? undefined : svc.sac,
      quantity: Number(r.quantity) || 1,
      unitType: r.unitType || "Hours",
      pricePerUnit: Number(r.pricePerUnit) || 0,
      discountType: r.discountType || "fixed",
      discountValue: Number(r.discountValue) || 0,
      serviceStartDate:
        r.serviceStartDate !== undefined
          ? r.serviceStartDate
            ? new Date(r.serviceStartDate)
            : null
          : r.travelDate
            ? new Date(r.travelDate)
            : undefined,
      serviceDueDate:
        r.serviceDueDate !== undefined
          ? r.serviceDueDate
            ? new Date(r.serviceDueDate)
            : null
          : undefined,
      travelDate:
        r.travelDate !== undefined
          ? r.travelDate
            ? new Date(r.travelDate)
            : null
          : r.serviceStartDate
            ? new Date(r.serviceStartDate)
            : undefined,
      travelFrom: r.travelFrom || "",
      travelTo: r.travelTo || "",
      vehicleType: r.vehicleType || "",
      vehicleNumber: r.vehicleNumber || "",
      fixedCharges,
      variableQty,
      variableUnit,
      variableRate,
      variableCharges,
    };

    items.push(normalized);
    computedTotal += amount;
    computedTax += lineTax;
  }

  return { items, computedTotal, computedTax };
};