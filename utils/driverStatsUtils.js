const Driver = require("../models/Transporter/Driver");
const Trip = require("../models/Transporter/Trip");

/**
 * Calculate driver statistics based on completed/delivered trips
 */
const calculateDriverStats = async (driverId, companyId, clientId) => {
  try {
    // Find all completed or delivered trips for this driver
    const trips = await Trip.find({
      driverId: driverId,
      createdByClient: clientId,
      companyId: companyId,
      status: { $in: ["Completed", "Delivered"] }
    });

    const stats = {
      totalTrips: trips.length,
      totalDistance: 0,
      totalEarnings: 0,
      totalBata: 0,
      lastTripDate: null
    };

    for (const trip of trips) {
      // Sum distance
      stats.totalDistance += trip.distance || 0;
      
      // Calculate earnings based on salary type
      if (trip.driverEarnings) {
        stats.totalEarnings += trip.driverEarnings || 0;
      }
      
      // Calculate Bata (daily allowance)
      // Assuming Bata is calculated per day or per trip
      const tripBata = trip.driverBata || trip.expenses?.driverBata || 0;
      if (tripBata) {
        stats.totalBata += tripBata;
      }
      
      // Track last trip date
      if (!stats.lastTripDate || (trip.endDate && trip.endDate > stats.lastTripDate)) {
        stats.lastTripDate = trip.endDate || trip.startDate;
      }
    }

    return stats;
  } catch (error) {
    console.error("Error calculating driver stats:", error);
    throw error;
  }
};

/**
 * Update driver with calculated statistics
 */
const updateDriverStats = async (driverId, companyId, clientId) => {
  try {
    const stats = await calculateDriverStats(driverId, companyId, clientId);
    
    await Driver.findByIdAndUpdate(driverId, {
      totalTrips: stats.totalTrips,
      totalDistance: stats.totalDistance,
      totalEarnings: stats.totalEarnings,
      totalBata: stats.totalBata,
      lastTripDate: stats.lastTripDate
    });
    
    return stats;
  } catch (error) {
    console.error("Error updating driver stats:", error);
    throw error;
  }
};

/**
 * Calculate earnings for a specific trip based on driver's salary structure
 */
const calculateDriverEarningsForTrip = async (driverId, tripData) => {
  const driver = await Driver.findById(driverId);
  if (!driver) return 0;

  let earnings = 0;
  
  switch (driver.salaryType) {
    case "Per Trip":
      earnings = driver.salaryPerTrip || 0;
      break;
    case "Per Day":
      // Calculate number of days for the trip
      const days = tripData.endDate 
        ? Math.ceil((tripData.endDate - tripData.startDate) / (1000 * 60 * 60 * 24))
        : 1;
      earnings = (driver.salaryPerDay || 0) * days;
      break;
    case "Monthly":
      // Calculate pro-rata monthly salary
      const monthDays = tripData.endDate
        ? Math.ceil((tripData.endDate - tripData.startDate) / (1000 * 60 * 60 * 24))
        : 1;
      earnings = ((driver.monthlySalary || 0) / 30) * monthDays;
      break;
    case "Percentage":
      // Percentage of trip profit
      const profit = (tripData.totalAmount || 0) - (tripData.totalExpenses || 0);
      earnings = profit * ((driver.profitPercentage || 0) / 100);
      break;
    default:
      earnings = 0;
  }
  
  return earnings;
};

module.exports = {
  calculateDriverStats,
  updateDriverStats,
  calculateDriverEarningsForTrip
};
