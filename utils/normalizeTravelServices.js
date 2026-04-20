// utils/normalizeTravelServices.js
const normalizeTravelServices = async (services, clientId) => {
    const items = [];
    let computedTotal = 0;
    let computedTax = 0;

    for (const service of services) {
        // Calculate variable charges
        const variableCharges = (Number(service.variableQty) || 0) * (Number(service.variableRate) || 0);

        // Calculate base amount (before discount)
        const fixedCharges = Number(service.fixedCharges) || 0;
        const waitingCharges = Number(service.waitingCharges) || 0;
        const overnightCharges = Number(service.overnightCharges) || 0;
        const tollTax = Number(service.tollTax) || 0;
        const parkingCharges = Number(service.parkingCharges) || 0;

        const grossAmount = fixedCharges +
            variableCharges +
            waitingCharges +
            overnightCharges +
            tollTax +
            parkingCharges;

        // 🔥 NEW: Calculate discount amount
        const discountType = service.discountType || 'fixed';
        const discountValue = Number(service.discountValue) || 0;
        
        let discountAmount = 0;
        if (discountType === 'percentage') {
            discountAmount = (grossAmount * discountValue) / 100;
        } else {
            discountAmount = discountValue;
        }
        
        // Ensure discount doesn't exceed gross amount
        discountAmount = Math.min(discountAmount, grossAmount);

        // 🔥 NEW: Apply discount to get final amount
        const finalAmount = grossAmount - discountAmount;

        // Calculate GST on the discounted amount
        const gstRate = Number(service.gstPercentage) || 0;
        const taxAmount = (finalAmount * gstRate) / 100;
        const totalWithTax = finalAmount + taxAmount;

        const normalized = {
            service: service.serviceId || service.service,
            serviceName: service.serviceName || '',
            amount: finalAmount, // 🔥 CHANGED: Now using discounted amount
            description: service.description || '',

            // Travel-specific fields
            travelDate: service.travelDate ? new Date(service.travelDate) : null,
            serviceStartDate: service.serviceStartDate ? new Date(service.serviceStartDate) : (service.travelDate ? new Date(service.travelDate) : null),
            serviceDueDate: service.serviceDueDate ? new Date(service.serviceDueDate) : null,
            travelFrom: service.travelFrom || '',
            travelTo: service.travelTo || '',
            vehicleType: service.vehicleType || '',
            vehicleNumber: service.vehicleNumber || '',
            driverName: service.driverName || '',
            driverContact: service.driverContact || '',

            // Trip details
            totalDistance: Number(service.totalDistance) || 0,
            returnTrip: service.returnTrip || false,

            // Billing structure
            fixedCharges: fixedCharges,
            variableQty: Number(service.variableQty) || 0,
            variableUnit: service.variableUnit || 'Km',
            variableRate: Number(service.variableRate) || 0,
            variableCharges: variableCharges,

            // Additional charges
            waitingCharges: waitingCharges,
            overnightCharges: overnightCharges,
            tollTax: tollTax,
            parkingCharges: parkingCharges,

            // Quantity fields
            quantity: Number(service.quantity) || 1,
            unitType: service.unitType || 'Km',
            pricePerUnit: Number(service.pricePerUnit) || 0,

            // GST fields - Now calculated on discounted amount
            gstPercentage: gstRate,
            lineTax: taxAmount, // 🔥 CHANGED: Tax on discounted amount
            lineTotal: totalWithTax, // 🔥 CHANGED: Discounted amount + tax
            sac: service.sac || '',

            // Discount
            discountType: discountType,
            discountValue: discountValue,
            
            // 🔥 NEW: Store gross amount for reference if needed
            grossAmount: grossAmount,
        };

        items.push(normalized);
        computedTotal += finalAmount; // 🔥 CHANGED: Add discounted amount to total
        computedTax += taxAmount;
    }

    return { items, computedTotal, computedTax };
};

module.exports = normalizeTravelServices;
