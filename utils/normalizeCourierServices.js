// utils/normalizeCourierServices.js

const normalizeCourierServices = (formData) => {
  const { courierServiceDetails, senderDetails, receiverDetails, courierItems = [] } = formData;

  // Calculate totals for the entire courier service
  let computedTotal = 0;
  let computedTax = 0;
  const processedItems = [];

  for (const item of courierItems) {
    const weight = Number(item.weight) || 0;
    const rate = Number(item.rate) || 0;
    const extraCharges = Number(item.extraCharges) || 0;
    // const noOfPackages = Number(item.noOfPackages) || 1;
    const length = Number(item.length) || 0;
    const breadth = Number(item.breadth) || 0;
    const height = Number(item.height) || 0;
    const volumeWeight = Number(item.volumeWeight) || 0;
    const gstPercentage = Number(item.gstPercentage) || 0;
    const discountType = item.discountType || "fixed";
    const discountValue = Number(item.discountValue) || 0;
    const description = item.description || "";
    const trackingNumber = item.trackingNumber || courierServiceDetails?.trackingNumber || "";
    const status = item.status || courierServiceDetails?.status || "Pending";

    // Gross amount = (weight × rate) + extraCharges
    const grossAmount = (weight * rate) + extraCharges;

    // Calculate discount
    let discountAmount = 0;
    if (discountValue > 0) {
      discountAmount = discountType === "percentage"
        ? (grossAmount * discountValue) / 100
        : discountValue;
    }

    // Calculate taxable amount and tax
    const taxableAmount = grossAmount - discountAmount;
    const taxAmount = (taxableAmount * gstPercentage) / 100;
    const lineTotal = taxableAmount + taxAmount;

    // Accumulate totals
    computedTotal += taxableAmount;
    computedTax += taxAmount;

    // Store processed item with all its details
    processedItems.push({
      // Item billing details
      weight,
      // noOfPackages,
      length,
      breadth,
      height,
      volumeWeight,
      rate,
      extraCharges,
      amount: grossAmount, // pre-discount gross
      discountType,
      discountValue,
      discountAmount,
      
      // GST details
      gstPercentage,
      lineTax: taxAmount,
      lineTotal,
      
      // Item specific details
      description,
      trackingNumber,
      status,
      destination: item.destination || "",
      
      // Optional: You might want to add item name/product details
      itemName: item.itemName || `Item ${processedItems.length + 1}`,
    });
  }

  // Calculate grand total
  const computedGrand = computedTotal + computedTax;

  // Return normalized structure
  return {
    // Service-level details (common across all items)
    service: courierServiceDetails?.service || "",
    serviceName: courierServiceDetails?.serviceName || "",
    sac: courierServiceDetails?.sac || "996812",
    bookingDate: courierServiceDetails?.bookingDate || null,
    description: courierServiceDetails?.description || "",
    trackingNumber: courierServiceDetails?.trackingNumber || "",
    status: courierServiceDetails?.status || "Pending",
    
    // Sender details (common for all items in this service)
    senderDetails: {
      name: senderDetails?.name || "",
      address: senderDetails?.address || "",
      city: senderDetails?.city || "",
      state: senderDetails?.state || "",
      pincode: senderDetails?.pincode || "",
      contactNumber: senderDetails?.contactNumber || "",
      gstin: senderDetails?.gstin || "",
    },
    
    // Receiver details (common for all items in this service)
    receiverDetails: {
      name: receiverDetails?.name || "",
      address: receiverDetails?.address || "",
      city: receiverDetails?.city || "",
      state: receiverDetails?.state || "",
      pincode: receiverDetails?.pincode || "",
      contactNumber: receiverDetails?.contactNumber || "",
      gstin: receiverDetails?.gstin || "",
    },
    
    // Items array containing all courier items
    items: processedItems,
    
    // Calculated totals
    totalTaxableAmount: computedTotal,
    totalTaxAmount: computedTax,
    totalAmount: computedGrand,
  };
};

module.exports = { normalizeCourierServices };