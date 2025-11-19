

export const template8Styles = {
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    padding: 25,
    paddingBottom: 34,
    fontFamily: "Helvetica"
  },
  section: {
    marginBottom: 20
  },
  header: {
    marginBottom: 0
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2583C6"
  },

  grayColor: {
    color: "#262626"
  },
  companyName: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 2,
    color: "#232323"
  },
  addressText: {
    fontSize: 9,
    marginBottom: 3,
    lineHeight: 1.2
  },

  dividerBlue: {
    borderBottom: "3px solid #2583C6",
    marginVertical: 2,
    marginBottom: 6
  },
  divider: {
    borderBottom: "2px solid #bfbfbf",
    marginVertical: 2,
    marginBottom: 6
  },
  threeColumn: {
    flexDirection: "row",
    justifyContent: "space-between",
    height: 180
  },
  column: {
    flex: 4,
    marginRight: 20
  },
  lastColumn: {
    flex: 1
  },
  columnTitle: {
    fontSize: 9,
    fontWeight: "bold",
    marginBottom: 6
  },
  normalText: {
    fontSize: 8,
    marginBottom: 2
  },
  boldText: {
    fontSize: 8,
    fontWeight: "bold",
    marginBottom: 2
  },
  table: {
    marginBottom: 0,
    border: "1px solid #bfbfbf",
    borderBottom: "1px solid #bfbfbf" // Added bottom border back
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#2583C6",
    color: "#FFFFFF",
    paddingLeft: 0,
    paddingRight: 0,
    fontSize: 9,
    borderBottom: "1px solid #bfbfbf" // Added border below header
  },
  tableRow: {
    flexDirection: "row",
    borderTop: "1px solid #bfbfbf", // Match table border thickness
    minHeight: 19
  },
  tableCellHeader: {
    fontSize: 7,
    borderRight: "1px solid #ffffff" // Match thickness with body borders
  },
  tableCell: {
    padding: 3,
    fontSize: 8
    // borderRight: "1px solid #bfbfbf",
  },
  tableCellSize7: {
    fontSize: 7
  },
  tableCellLast: {
    padding: 3,
    fontSize: 8
    // No borderRight for last cell in row
  },
  totalsSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10
  },
  totalsLeft: {
    fontSize: 8
  },
  totalsRight: {
    fontSize: 10,
    textAlign: "right"
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 32,
    marginBottom: 4
  },
  paymentSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15
  },
  stamp: {
    width: 80,
    height: 80,
    border: "1px solid blue",
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center"
  },
  stampText: {
    fontSize: 6,
    fontWeight: "bold"
  },
  termsSection: {
    fontSize: 8
  },

  sectionHeader: {
    fontSize: 11,
    marginBottom: 3
  },

  detailText: {
    fontSize: 9,
    lineHeight: 1.1
  },
  currencyText: {
    fontFamily: "YourChosenFont"
  },
  smallRs: {
    fontSize: 10
  },
  pageNumber: {
    position: "absolute",
    bottom: 10,
    right: 24,
    fontSize: 8,
    textAlign: "right"
  }
}

// A5 specific styles
export const templateA5Styles = {
  tableOuterBorder: {
    borderColor: "#0371C1",
    borderWidth: 0, // Default to no border
    marginVertical: 10
  },
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    padding: 20,
    paddingBottom: 30,
    fontSize: 8,
    fontFamily: "Helvetica"
  },
  header: {
    display: "flex",
    flexDirection: "row",
    // marginBottom: 1,
    // borderBottom: '1px solid #000',
    paddingBottom: 4,
    alignItems: "center",
    textAlign: "center",
    gap: 6
  },
  headerLeft: {
    alignItems: "flex-start"
  },
  headerRight: {
    flex: 3,
    alignItems: "flex-start"
  },
  logo: {
    width: 70,
    height: 70
  },
  companyName: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5
  },
  address: {
    fontSize: 10,
    marginBottom: 3,
    lineHeight: 1.2
  },
  contactInfo: {
    fontSize: 10,
    lineHeight: 1.2,
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    alignItems: "center"
  },

  contactLabel: {
    fontSize: 10,
    fontWeight: "bold"
  },
  contactValue: {
    fontSize: 10,
    fontWeight: "normal"
  },
  section: {
    // border: "1.5px solid #0371C1",
    padding: 0
  },
  tableHeader: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    border: "1.5px solid #0371C1"
  },
  gstRow: {
    flexDirection: "row",
    padding: 3
  },
  gstLabel: {
    fontSize: 10,
    fontWeight: "bold"
  },
  gstValue: {
    fontSize: 10,
    fontWeight: "normal"
  },
  invoiceTitleRow: {
    padding: 3
  },
  invoiceTitle: {
    fontSize: 16,
    fontWeight: "extrabold",
    textAlign: "center",
    color: "#0371C1"
  },
  recipientRow: {
    padding: 3
  },
  recipientText: {
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "center"
  },

  threeColSection: {
    flexDirection: "row",
    // marginBottom: 10,
    borderBottom: "1.5px solid #0371C1",
    borderLeft: "1.5px solid #0371C1",
    borderRight: "1.5px solid #0371C1"
  },
  column: {
    width: "33.3%",
    paddingHorizontal: 4,
    borderLeft: "1px solid #0371C1"
  },
  columnHeader: {
    marginBottom: 5
  },
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 2
  },
  threecoltableHeader: {
    fontSize: 8,
    fontWeight: "bold"
  },
  tableLabel: {
    fontSize: 8,
    fontWeight: "bold",
    width: "40%", // Fixed width for labels
    flexShrink: 0,
    wrap: true,
    hyphens: "none"
  },
  tableValue: {
    fontSize: 8,
    fontWeight: "normal",
    width: "70%", // Fixed width for values
    flexShrink: 1,
    wrap: true,
    hyphens: "none"
  },

  // item table style
  itemsTable: {
    // marginTop: 10,
    // border: '1px solid #000',
  },
  tableContainer: {
    position: "relative",
    width: "100%",
    borderBottom: "1.5px solid #0371C1",
    borderLeft: "1.5px solid #0371C1",
    borderRight: "1.5px solid #0371C1"
  },
  verticalBorder: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "#0371C1"
  },
  itemsTableHeader: {
    flexDirection: "row",
    backgroundColor: "rgba(3, 113, 193, 0.2)",
    borderBottom: "1px solid #0371C1",
    borderTop: 0
  },
  headerCell: {
    // borderRight: '1px solid #0371C1',
    justifyContent: "center",
    alignItems: "center",
    padding: 2
  },
  itemsTableRow: {
    flexDirection: "row",
    // borderBottom: '1px solid #0371C1',
    alignItems: "flex-start"
  },
  itemsTableTotalRow: {
    flexDirection: "row",
    // borderTop: "1px solid #0371C1",
    backgroundColor: "rgba(3, 113, 193, 0.2)",
    alignItems: "center"
  },
  // Header Styles
  srNoHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "8%",
    textAlign: "center",
    padding: 2
  },
  productHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "25%",
    // textAlign: "center",
    padding: 2
    // borderLeft:"1px solid #0371C1"
  },
  hsnHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "10%",
    textAlign: "center",
    padding: 2
    // borderLeft:"1px solid #0371C1"
  },
  qtyHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "8%",
    textAlign: "center",
    padding: 2
    // borderLeft:"1px solid #0371C1"
  },
  rateHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "10%",
    textAlign: "center",
    padding: 2
    // borderLeft:"1px solid #0371C1"
  },
  taxableHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "12%",
    textAlign: "center",
    padding: 2
    // borderLeft:"1px solid #0371C1"
  },
  igstHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "12%"
    // borderLeft: "1px solid #0371C1",
    // borderRight: "1px solid #0371C1",
  },
  totalHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "15%",
    textAlign: "center",
    padding: 2
  },
  igstMainHeader: {
    fontSize: 7,
    fontWeight: "bold",
    textAlign: "center",
    padding: 1
  },
  igstSubHeader: { flexDirection: "row", borderTop: "1px solid #0371C1" },
  igstSubText: {
    fontSize: 6,
    fontWeight: "bold",
    width: "70%",
    textAlign: "center",
    padding: 1
  },
  igstSubPercentage: {
    fontSize: 6,
    fontWeight: "bold",
    width: "30%",
    textAlign: "center",
    padding: 1
  },

  // Cell Styles
  srNoCell: { fontSize: 7, width: "8%", textAlign: "center", padding: 2 },
  productCell: {
    fontSize: 7,
    width: "25%",
    textAlign: "left",
    padding: 2,
    // borderLeft: "1px solid #0371C1",
    wrap: true
  },
  hsnCell: {
    fontSize: 7,
    width: "10%",
    textAlign: "center",
    padding: 2
    // borderLeft: "1px solid #0371C1",
  },
  qtyCell: {
    fontSize: 7,
    width: "8%",
    textAlign: "center",
    padding: 2
    // borderLeft: "1px solid #0371C1",
  },
  rateCell: {
    fontSize: 7,
    width: "10%",
    textAlign: "center",
    padding: 2
    // borderLeft: "1px solid #0371C1",
  },
  taxableCell: {
    fontSize: 7,
    width: "12%",
    textAlign: "center",
    padding: 2
    // borderLeft: "1px solid #0371C1",
    // borderRight: "1px solid #0371C1",
  },
  igstCell: {
    flexDirection: "row",
    width: "12%",
    display: "flex",
    justifyContent: "center", // horizontally center children
    alignItems: "center", // vertically center children
    gap: 10,
    // borderLeft: "1px solid #0371C1", // optional
    textAlign: "center",
    paddingVertical: 3
  },
  igstPercent: {
    fontSize: 7,
    textAlign: "center",
    padding: 1,
    width: "30%" // ensure consistent spacing
  },
  igstAmount: {
    fontSize: 7,
    textAlign: "center",
    padding: 1,
    width: "70%"
  },
  totalCell: {
    fontSize: 7,
    width: "15%",
    textAlign: "center",
    padding: 2
    // borderLeft: "1px solid #0371C1",
  },

  // Total Row Styles
  totalLabel: {
    fontSize: 7,
    fontWeight: "bold",
    textAlign: "center",
    padding: 2
  },
  totalEmpty: {
    fontSize: 7,
    width: "25%",
    padding: 2,
    textAlign: "center",
    fontWeight: "bold"
  },
  totalQty: {
    fontSize: 7,
    fontWeight: "bold",
    width: "8%",
    textAlign: "center",
    padding: 2
  },
  totalTaxable: {
    fontSize: 7,
    fontWeight: "bold",
    width: "12%",
    textAlign: "center",
    padding: 2
  },
  igstTotal: {
    fontSize: 7,
    // padding:2,
    borderLeft: "1px solid #ddd",
    borderRight: "1px solid #ddd"
  },
  totalIgstAmount: {
    fontSize: 7,
    fontWeight: "bold",
    textAlign: "right",
    padding: 1
  },
  grandTotal: {
    fontSize: 7,
    fontWeight: "bold",
    width: "15%",
    textAlign: "center",
    padding: 2
  },

  // igstHeader: {
  //   flexDirection: 'row',
  //   width: '12%',
  //   borderLeft: '1px solid #000',
  //   borderRight: '1px solid #000',
  // },
  igstPercentHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "50%",
    textAlign: "center",
    padding: 2,
    borderRight: "1px solid #000"
  },
  igstAmountHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "50%",
    textAlign: "center",
    padding: 2
  },

  igstPercentCell: {
    fontSize: 7,
    // width: '50%',
    textAlign: "center",
    padding: 2
    // borderRight: '1px solid #ddd',
  },
  igstAmountCell: {
    fontSize: 7,
    // width: '50%',
    textAlign: "center",
    padding: 2
  },

  bottomSection: {
    flexDirection: "row",
    borderTop: "1px solid #0371C1",
    width: "100%",
    fontSize: 7,
    borderLeft: "1px solid #0371C1",
    borderRight: "1px solid #0371C1",
    borderBottom: "1px solid #0371C1"
  },

  // Left half
  leftSection: {
    width: "65%",
    borderRight: "1px solid #0371C1"
  },

  totalInWords: {
    fontSize: 7,
    fontWeight: "bold",
    borderBottom: "1px solid #0371C1",
    padding: 3,
    textTransform: "uppercase"
  },

  termsBox: {
    // marginTop: 3,
    padding: 8,
    paddingTop: 0
  },
  // In your pdf-template-styles.ts
  termLine: {
    fontSize: 10,
    marginBottom: 2,
    fontFamily: "Helvetica",
    // Default styles that can be overridden
    color: "#000000",
    textAlign: "left",
    fontWeight: "normal",
    textDecoration: "none",
    backgroundColor: "transparent"
  },

  qrContainer: {
    alignItems: "center",
    marginTop: 6
  },
  qrImage: {
    width: 45,
    height: 45
  },
  qrText: {
    fontSize: 7,
    marginTop: 2
  },

  // Right half
  rightSection: {
    width: "35%",
    justifyContent: "flex-start"
  },

  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottom: "1px solid #0371C1",
    padding: 3
  },

  label: { fontSize: 8, fontWeight: "bold" },
  value: { fontSize: 8, fontWeight: "bold" },

  labelBold: { fontSize: 8, fontWeight: "bold" },
  valueBold: { fontSize: 8, fontWeight: "bold" },

  highlightRow: {
    backgroundColor: "#EAF4FF"
  },

  currencySymbol: {
    fontSize: 6
  },
  pageNumber: {
    position: "absolute",
    bottom: 20, // Distance from bottom of page
    right: 20, // Distance from right of page
    fontSize: 8,
    textAlign: "right"
  }
}

export const templateA5_3Styles = {
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    padding: 20,
    paddingBottom: 30,
    fontSize: 8,
    fontFamily: "Helvetica"
  },
  header: {
    display: "flex",
    flexDirection: "row",
    // marginBottom: 1,
    // borderBottom: '1px solid #000',
    paddingBottom: 4,
    alignItems: "flex-start",
    textAlign: "left",
    gap: 6
  },
  headerLeft: {
    alignItems: "flex-start"
  },
  headerRight: {
    flex: 3,
    alignItems: "flex-start"
    // marginLeft: 10,
  },
  logo: {
    width: 60,
    height: 60,
    marginRight: 5
  },
  companyName: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5
  },
  address: {
    fontSize: 10,
    marginBottom: 3,
    lineHeight: 1.2
  },
  contactInfo: {
    fontSize: 10,
    lineHeight: 1.2,
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    // gap: 4,
    alignItems: "center"
  },

  contactLabel: {
    fontSize: 10,
    fontWeight: "bold"
  },
  contactValue: {
    fontSize: 10,
    fontWeight: "normal"
  },
  section: {
    // border: "1.5px solid #0371C1",
    padding: 0
  },
  tableHeader: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    border: "1.5px solid #0371C1"
  },
  gstRow: {
    flexDirection: "row",
    padding: 3
  },
  gstLabel: {
    fontSize: 10,
    fontWeight: "bold"
  },
  gstValue: {
    fontSize: 10,
    fontWeight: "normal"
  },
  invoiceTitleRow: {
    padding: 3
  },
  invoiceTitle: {
    fontSize: 12,
    fontWeight: "extrabold",
    textAlign: "center",
    color: "#0371C1"
  },
  recipientRow: {
    padding: 3
  },
  recipientText: {
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "center"
  },

  threeColSection: {
    flexDirection: "row",
    // marginBottom: 10,
    borderBottom: "1.5px solid #0371C1",
    borderLeft: "1.5px solid #0371C1",
    borderRight: "1.5px solid #0371C1"
  },
  column: {
    width: "33.3%",
    paddingHorizontal: 4,
    borderLeft: "1px solid #0371C1"
  },
  column2: {
    width: "50%",
    paddingHorizontal: 4,
    borderLeft: "1px solid #0371C1"
  },
  columnHeader: {
    marginBottom: 5
  },
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 2
  },
  threecoltableHeader: {
    fontSize: 8,
    fontWeight: "bold"
  },
  tableLabel: {
    fontSize: 8,
    fontWeight: "bold",
    width: "40%", // Fixed width for labels
    flexShrink: 0,
    wrap: true,
    hyphens: "none"
  },
  tableValue: {
    fontSize: 8,
    fontWeight: "normal",
    width: "70%", // Fixed width for values
    flexShrink: 1,
    wrap: true,
    hyphens: "none"
  },

  // item table style
  itemsTable: {
    // marginTop: 10,
    // border: '1px solid #000',
  },
  itemsTableHeader: {
    flexDirection: "row",
    backgroundColor: "rgba(3, 113, 193, 0.2)",
    borderBottom: "1px solid #0371C1",
    borderTop: 0
  },
  headerCell: {
    borderRight: "1px solid #0371C1",
    justifyContent: "center",
    alignItems: "center",
    padding: 2
  },
  itemsTableRow: {
    flexDirection: "row",
    // borderBottom: '1px solid #0371C1',
    alignItems: "flex-start"
  },
  itemsTableTotalRow: {
    flexDirection: "row",
    // borderTop: "1px solid #0371C1",
    backgroundColor: "rgba(3, 113, 193, 0.2)",
    alignItems: "center"
  },
  // Header Styles
  srNoHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "8%",
    textAlign: "center",
    padding: 2
  },
  productHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "25%",
    // textAlign: "center",
    padding: 3
    // borderLeft:"1px solid #0371C1"
  },
  hsnHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "10%",
    textAlign: "center",
    padding: 2
    // borderLeft:"1px solid #0371C1"
  },
  qtyHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "8%",
    textAlign: "center",
    padding: 2
    // borderLeft:"1px solid #0371C1"
  },
  rateHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "10%",
    textAlign: "center",
    padding: 2
    // borderLeft:"1px solid #0371C1"
  },
  taxableHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "12%",
    textAlign: "center",
    padding: 2
    // borderLeft:"1px solid #0371C1"
  },
  igstHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "12%"
    // borderLeft: "1px solid #0371C1",
    // borderRight: "1px solid #0371C1",
  },
  totalHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "15%",
    textAlign: "center",
    padding: 2
  },
  igstMainHeader: {
    fontSize: 7,
    fontWeight: "bold",
    textAlign: "center",
    padding: 1
  },
  igstSubHeader: { flexDirection: "row", borderTop: "1px solid #0371C1" },
  igstSubText: {
    fontSize: 6,
    fontWeight: "bold",
    width: "70%",
    textAlign: "center",
    padding: 0
  },
  igstSubPercentage: {
    fontSize: 6,
    fontWeight: "bold",
    width: "30%",
    textAlign: "center",
    padding: 1
  },
  Tablecolumn: {
    column: {
      borderRight: "1px solid #0371C1"
    }
  },
  tableContainer: {
    position: "relative",
    width: "100%",
    borderBottom: "1.5px solid #0371C1",
    borderLeft: "1.5px solid #0371C1",
    borderRight: "1.5px solid #0371C1"
  },
  verticalBorder: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "#0371C1"
  },

  verticalBorderHSN: {
    position: "absolute",
    borderLeft: "1px solid #0371C1",
    top: 0,
    bottom: 0
  },
  // Cell Styles
  srNoCell: { fontSize: 7, width: "8%", textAlign: "center", padding: 3 },
  productCell: {
    fontSize: 7,
    width: "25%",
    textAlign: "left",
    padding: 3,
    // borderLeft: "1px solid #0371C1",
    wrap: true
  },
  hsnCell: {
    fontSize: 7,
    width: "10%",
    textAlign: "center",
    padding: 3
    // borderLeft: "1px solid #0371C1",
  },
  qtyCell: {
    fontSize: 7,
    width: "10%",
    textAlign: "center",
    padding: 3
  },
  rateCell: {
    fontSize: 7,
    width: "10%",
    textAlign: "center",
    padding: 3
    // borderLeft: "1px solid #0371C1",
  },
  taxableCell: {
    fontSize: 7,
    width: "12%",
    textAlign: "center",
    padding: 3
    // borderLeft: "1px solid #0371C1",
    // borderRight: "1px solid #0371C1",
  },
  igstCell: {
    flexDirection: "row",
    width: "12%",
    display: "flex",
    justifyContent: "center", // horizontally center children
    alignItems: "center", // vertically center children
    gap: 10,
    // borderLeft: "1px solid #0371C1", // optional
    textAlign: "center",
    paddingVertical: 3
  },
  igstPercent: {
    fontSize: 7,
    textAlign: "right",
    padding: 1,
    width: "30%" // ensure consistent spacing
  },
  igstAmount: {
    fontSize: 7,
    textAlign: "center",
    padding: 0,
    width: "70%",
    alignItems: "flex-start",
    display: "flex",
    justifyContent: "flex-start"
  },
  totalCell: {
    fontSize: 7,
    width: "15%",
    textAlign: "center",
    padding: 3
    // borderLeft: "1px solid #0371C1",
  },

  // Total Row Styles
  totalLabel: {
    fontSize: 7,
    fontWeight: "bold",
    textAlign: "center",
    padding: 2
  },
  totalEmpty: {
    fontSize: 7,
    width: "25%",
    padding: 2,
    textAlign: "center",
    fontWeight: "bold"
  },
  totalQty: {
    fontSize: 7,
    fontWeight: "bold",
    width: "8%",
    textAlign: "center",
    padding: 2
  },
  totalTaxable: {
    fontSize: 7,
    fontWeight: "bold",
    width: "12%",
    textAlign: "center",
    padding: 2
  },
  igstTotal: {
    fontSize: 7
    // borderLeft: "1px solid #ddd",
    // borderRight: "1px solid #ddd",
  },
  totalIgstAmount: {
    fontSize: 7,
    fontWeight: "bold",
    textAlign: "right",
    padding: 1
  },
  grandTotal: {
    fontSize: 7,
    fontWeight: "bold",
    width: "15%",
    textAlign: "center",
    padding: 2
  },

  // igstHeader: {
  //   flexDirection: 'row',
  //   width: '12%',
  //   borderLeft: '1px solid #000',
  //   borderRight: '1px solid #000',
  // },
  igstPercentHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "50%",
    textAlign: "center",
    padding: 2,
    borderRight: "1px solid #000"
  },
  igstAmountHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "50%",
    textAlign: "center",
    padding: 2
  },

  igstPercentCell: {
    fontSize: 7,
    // width: '50%',
    textAlign: "right",
    padding: 2
    // borderRight: '1px solid #ddd',
  },
  igstAmountCell: {
    fontSize: 7,
    width: "70%",
    textAlign: "center",
    padding: 2
  },

  bottomSection: {
    flexDirection: "row",
    // borderTop: "1px solid #0371C1",
    width: "100%",
    fontSize: 7,
    border: "1px solid #0371C1",
    // borderRight: '1px solid #0371C1',
    // borderBottom:"1px solid #0371C1"
    paddingTop: 5
  },

  // Left half
  leftSection: {
    width: "60%",
    borderRight: "1px solid #0371C1",
    height: "103%",
    marginTop: -5
  },

  totalInWords: {
    fontSize: 7,
    fontWeight: "bold",
    borderBottom: "1px solid #0371C1",
    padding: 3,
    textTransform: "uppercase"
  },

  termsBox: {
    // marginTop: 3,
    padding: 8,
    paddingTop: 0
  },
  // In your pdf-template-styles.ts
  termLine: {
    fontSize: 10,
    // marginBottom: 3,
    fontFamily: "Helvetica",
    // Default styles that can be overridden
    color: "#000000",
    textAlign: "left",
    fontWeight: "normal",
    textDecoration: "none",
    backgroundColor: "transparent"
  },

  qrContainer: {
    alignItems: "center",
    marginTop: 6
  },
  qrImage: {
    width: 45,
    height: 45
  },
  qrText: {
    fontSize: 7,
    marginTop: 2
  },

  //hst summary table

  // Add these styles to your templateA5_3Styles
  hsnTaxTable: {
    position: "relative",
    border: "1px solid #0371C1",
    borderTop: 0,
    borderRight: "none",
    borderLeft: "none",
    backgroundColor: "#FFFFFF",
    borderBottom: 0
  },
  hsnTaxTableContainer: {
    position: "relative",
    width: "100%",
    borderBottom: "1px solid #0371C1",
    borderLeft: "1px solid #0371C1",
    borderRight: "1px solid #0371C1"
  },
  hsnTaxTableTitle: {
    backgroundColor: "#0371C1",
    color: "#FFFFFF",
    // padding: 6,
    fontSize: 8,
    fontWeight: "bold",
    textAlign: "center"
  },
  hsnTaxTableHeader: {
    flexDirection: "row",
    backgroundColor: "#f0f8ff",
    borderBottom: "1px solid #0371C1",
    borderLeft: 0,
    borderRight: 0,
    borderTop: "1px solid #0371C1"
  },
  hsnTaxHeaderCell: {
    padding: 1,
    fontSize: 7,
    fontWeight: "bold",
    textAlign: "center",
    borderRight: "1px solid #0371C1"
  },
  hsnTaxTableRow: {
    flexDirection: "row"
    // borderBottom: '0.5px solid #0371C1',
  },
  hsnTaxCell: {
    padding: 1,
    fontSize: 7,
    textAlign: "center",
    borderRight: "1px solid #0371C1"
  },

  columnBackground: {
    position: "absolute",
    top: 0,
    bottom: 0,
    zIndex: -1 // Ensure it stays behind the content
  },
  hsnTaxTableTotalRow: {
    flexDirection: "row",
    backgroundColor: "rgba(3, 113, 193, 0.2)",
    // borderTop: '1px solid #0371C1',
    position: "relative"
  },
  hsnTaxTotalCell: {
    padding: 1,
    fontSize: 7,
    fontWeight: "bold",
    textAlign: "center"
  },

  // Right half
  rightSection: {
    width: "40%",
    justifyContent: "flex-start"
  },

  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottom: "1px solid #0371C1",
    padding: 3
  },

  label: { fontSize: 8, fontWeight: "bold" },
  value: { fontSize: 8, fontWeight: "bold" },

  labelBold: { fontSize: 8, fontWeight: "bold" },
  valueBold: { fontSize: 8, fontWeight: "bold" },

  highlightRow: {
    backgroundColor: "#EAF4FF"
  },

  currencySymbol: {
    fontSize: 6
  },
  pageNumber: {
    position: "absolute",
    bottom: 10, // Distance from bottom of page
    right: 20, // Distance from right of page
    fontSize: 8,
    textAlign: "right"
  }
}

export const templateA5_4Styles = {
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    padding: 20,
    paddingBottom: 30,
    fontSize: 8,
    fontFamily: "Helvetica"
  },
  header: {
    display: "flex",
    flexDirection: "row",
    // marginBottom: 1,
    // borderBottom: '1px solid #000',
    paddingBottom: 4,
    alignItems: "center",
    textAlign: "center",
    gap: 6
  },
  columnBackground: {
    position: "absolute",
    top: 0,
    bottom: 0,
    zIndex: -1 // Ensure it stays behind the content
  },
  headerLeft: {
    alignItems: "flex-start"
  },
  headerRight: {
    flex: 3,
    alignItems: "center",
    marginLeft: 10
  },
  logo: {
    width: 60,
    height: 60
  },
  companyName: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5
  },
  address: {
    fontSize: 10,
    marginBottom: 3,
    lineHeight: 1.2
  },
  contactInfo: {
    fontSize: 10,
    lineHeight: 1.2,
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    alignItems: "center"
  },

  contactLabel: {
    fontSize: 10,
    fontWeight: "bold"
  },
  contactValue: {
    fontSize: 10,
    fontWeight: "normal"
  },
  section: {
    // border: "1.5px solid #0371C1",
    padding: 0
  },
  tableHeader: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    Bottom: "1.5px solid #0371C1"
  },
  gstRow: {
    flexDirection: "row",
    padding: 3
  },
  gstLabel: {
    fontSize: 10,
    fontWeight: "bold"
  },
  gstValue: {
    fontSize: 10,
    fontWeight: "normal"
  },
  invoiceTitleRow: {
    padding: 3
  },
  invoiceTitle: {
    fontSize: 12,
    fontWeight: "extrabold",
    textAlign: "center",
    color: "#0371C1"
  },
  recipientRow: {
    padding: 3
  },
  recipientText: {
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "center"
  },

  threeColSection: {
    flexDirection: "row",
    // marginBottom: 10,
    border: "1.5px solid #0371C1"
  },
  column: {
    width: "25%",
    paddingHorizontal: 4,
    borderLeft: "1px solid #0371C1"
  },
  columnHeader: {
    marginBottom: 5
  },
  dataRow: {
    display: "flex",
    // gap:,
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    paddingVertical: 2,
    gap: 8
  },
  threecoltableHeader: {
    fontSize: 10,
    fontWeight: "bold"
  },
  tableLabel: {
    fontSize: 8,
    fontWeight: "bold",
    flex: 1, // label thoda space lega
    wrap: true // wrap allow karega
  },
  tableValue: {
    fontSize: 8,
    fontWeight: "normal",
    flex: 2, // value jyada space lega
    wrap: true // agar text lamba ho to next line pe chala jaaye
  },

  // item table style
  itemsTable: {
    // marginTop: 10,
    // border: '1px solid #000',
  },
  itemsTableHeader: {
    flexDirection: "row",
    backgroundColor: "rgba(3, 113, 193, 0.2)",
    borderBottom: "1px solid #0371C1",
    borderTop: 0
  },
  headerCell: {
    borderRight: "1px solid #0371C1",
    justifyContent: "center",
    alignItems: "center",
    padding: 2
  },
  itemsTableRow: {
    flexDirection: "row",
    // borderBottom: '1px solid #0371C1',
    alignItems: "flex-start"
  },
  itemsTableTotalRow: {
    flexDirection: "row",
    // borderTop: "1px solid #0371C1",
    backgroundColor: "rgba(3, 113, 193, 0.2)",
    alignItems: "center"
  },
  // Header Styles
  srNoHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "8%",
    textAlign: "center",
    padding: 2
  },
  productHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "25%",
    // textAlign: "center",
    padding: 3
    // borderLeft:"1px solid #0371C1"
  },
  hsnHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "10%",
    textAlign: "center",
    padding: 2
    // borderLeft:"1px solid #0371C1"
  },
  qtyHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "8%",
    textAlign: "center",
    padding: 2
    // borderLeft:"1px solid #0371C1"
  },
  rateHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "10%",
    textAlign: "center",
    padding: 2
    // borderLeft:"1px solid #0371C1"
  },
  taxableHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "12%",
    textAlign: "center",
    padding: 2
    // borderLeft:"1px solid #0371C1"
  },
  igstHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "12%"
    // borderLeft: "1px solid #0371C1",
    // borderRight: "1px solid #0371C1",
  },
  totalHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "15%",
    textAlign: "center",
    padding: 2
  },
  igstMainHeader: {
    fontSize: 7,
    fontWeight: "bold",
    textAlign: "center",
    padding: 1
  },
  igstSubHeader: { flexDirection: "row", borderTop: "1px solid #0371C1" },
  igstSubText: {
    fontSize: 6,
    fontWeight: "bold",
    width: "70%",
    textAlign: "center",
    padding: 1
  },
  igstSubPercentage: {
    fontSize: 6,
    fontWeight: "bold",
    width: "30%",
    textAlign: "center",
    padding: 1
  },
  Tablecolumn: {
    column: {
      borderRight: "1px solid #0371C1"
    }
  },
  tableContainer: {
    position: "relative",
    width: "100%",
    borderBottom: "1.5px solid #0371C1",
    borderLeft: "1.5px solid #0371C1",
    borderRight: "1.5px solid #0371C1"
  },
  verticalBorder: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "#0371C1"
  },
  hsnVerticalBorder: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "#0371C1"
  },
  // Cell Styles
  srNoCell: { fontSize: 7, width: "8%", textAlign: "center", padding: 3 },
  productCell: {
    fontSize: 7,
    width: "25%",
    textAlign: "left",
    padding: 3,
    // borderLeft: "1px solid #0371C1",
    wrap: true
  },
  hsnCell: {
    fontSize: 7,
    width: "10%",
    textAlign: "center",
    padding: 3
    // borderLeft: "1px solid #0371C1",
  },
  qtyCell: {
    fontSize: 7,
    width: "8%",
    textAlign: "center",
    padding: 3
    // borderLeft: "1px solid #0371C1",
  },
  rateCell: {
    fontSize: 7,
    width: "10%",
    textAlign: "center",
    padding: 3
    // borderLeft: "1px solid #0371C1",
  },
  taxableCell: {
    fontSize: 7,
    width: "12%",
    textAlign: "center",
    padding: 3
    // borderLeft: "1px solid #0371C1",
    // borderRight: "1px solid #0371C1",
    //  backgroundColor: 'rgba(3, 113, 193, 0.2)',
  },
  igstCell: {
    flexDirection: "row",
    width: "12%",
    display: "flex",
    justifyContent: "center", // horizontally center children
    alignItems: "center", // vertically center children
    gap: 10,
    // borderLeft: "1px solid #0371C1", // optional
    textAlign: "center",
    paddingVertical: 3
  },
  igstPercent: {
    fontSize: 7,
    textAlign: "center",
    padding: 1,
    width: "30%" // ensure consistent spacing
  },
  igstAmount: {
    fontSize: 7,
    textAlign: "center",
    padding: 0,
    width: "70%",
    alignItems: "flex-start",
    display: "flex",
    justifyContent: "flex-start"
  },
  totalCell: {
    fontSize: 7,
    width: "15%",
    textAlign: "center",
    padding: 3
    // borderLeft: "1px solid #0371C1",
    //  backgroundColor: 'rgba(3, 113, 193, 0.2)',
  },

  // Total Row Styles
  totalLabel: {
    fontSize: 7,
    fontWeight: "bold",
    textAlign: "center",
    padding: 2
  },
  totalEmpty: {
    fontSize: 7,
    width: "25%",
    padding: 2,
    textAlign: "center",
    fontWeight: "bold"
  },
  totalQty: {
    fontSize: 7,
    fontWeight: "bold",
    width: "8%",
    textAlign: "center",
    padding: 2
  },
  totalTaxable: {
    fontSize: 7,
    fontWeight: "bold",
    width: "12%",
    textAlign: "center",
    padding: 2
  },
  igstTotal: {
    fontSize: 7
    // padding:2
    // borderLeft: "1px solid #ddd",
    // borderRight: "1px solid #ddd",
  },
  totalIgstAmount: {
    fontSize: 7,
    fontWeight: "bold",
    textAlign: "right",
    padding: 1
  },
  grandTotal: {
    fontSize: 7,
    fontWeight: "bold",
    width: "15%",
    textAlign: "center",
    padding: 2
  },

  // igstHeader: {
  //   flexDirection: 'row',
  //   width: '12%',
  //   borderLeft: '1px solid #000',
  //   borderRight: '1px solid #000',
  // },
  igstPercentHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "50%",
    textAlign: "center",
    padding: 2,
    borderRight: "1px solid #000"
  },
  igstAmountHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "50%",
    textAlign: "center",
    padding: 2
  },

  igstPercentCell: {
    fontSize: 7,
    // width: '50%',
    textAlign: "right",
    padding: 2
    // borderRight: '1px solid #ddd',
  },
  igstAmountCell: {
    fontSize: 7,
    width: "70%",
    textAlign: "center",
    padding: 2
  },

  bottomSection: {
    flexDirection: "row",
    // borderTop: "1px solid #0371C1",
    width: "100%",
    fontSize: 7,
    border: "1px solid #0371C1"
    // borderRight: '1px solid #0371C1',
    // borderBottom:"1px solid #0371C1"
  },

  // Left half
  leftSection: {
    width: "55%",
    borderRight: "1px solid #0371C1"
  },

  totalInWords: {
    fontSize: 7,
    fontWeight: "bold",
    borderBottom: "1px solid #0371C1",
    padding: 3,
    textTransform: "uppercase"
  },

  termsBox: {
    // marginTop: 3,
    padding: 8,
    paddingTop: 0
  },
  // In your pdf-template-styles.ts
  termLine: {
    fontSize: 10,
    marginBottom: 3,
    fontFamily: "Helvetica",
    // Default styles that can be overridden
    color: "#000000",
    textAlign: "left",
    fontWeight: "normal",
    textDecoration: "none",
    backgroundColor: "transparent"
  },

  qrContainer: {
    alignItems: "center",
    marginTop: 6
  },
  qrImage: {
    width: 45,
    height: 45
  },
  qrText: {
    fontSize: 7,
    marginTop: 2
  },

  //hst summary table

  // Add these styles to your templateA5_3Styles
  hsnTaxTable: {
    borderBottom: "1px solid #0371C1",
    backgroundColor: "#FFFFFF",
    position: "relative"
  },
  hsnTaxTableTitle: {
    backgroundColor: "#0371C1",
    color: "#FFFFFF",
    // padding: 6,
    fontSize: 8,
    fontWeight: "bold",
    textAlign: "center"
  },
  hsnTaxTableHeader: {
    flexDirection: "row",
    backgroundColor: "#f0f8ff",
    borderBottom: "1px solid #0371C1",
    position: "relative"
  },
  hsnTaxHeaderCell: {
    padding: 1,
    fontSize: 7,
    fontWeight: "bold",
    borderRight: "0.5px solid #0371C1",
    textAlign: "center"
  },
  hsnTaxTableRow: {
    flexDirection: "row",
    borderBottom: "0.5px solid #0371C1"
    // position: "relative",
  },
  hsnTaxCell: {
    padding: 1,
    fontSize: 7,
    borderRight: "1px solid #0371C1",
    textAlign: "center"
  },
  hsnTaxTableTotalRow: {
    flexDirection: "row",
    backgroundColor: "rgba(3, 113, 193, 0.2)"
    // borderTop: '1px solid #0371C1',
  },
  hsnTaxTotalCell: {
    padding: 1,
    fontSize: 7,
    fontWeight: "bold",
    borderRight: "1px solid #0371C1",
    textAlign: "center"
  },

  // Right half
  rightSection: {
    width: "45%",
    justifyContent: "flex-start"
  },

  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottom: "1px solid #0371C1",
    padding: 3
  },

  label: { fontSize: 8, fontWeight: "bold" },
  value: { fontSize: 8, fontWeight: "bold" },

  labelBold: { fontSize: 8, fontWeight: "bold" },
  valueBold: { fontSize: 8, fontWeight: "bold" },

  highlightRow: {
    backgroundColor: "#EAF4FF"
  },

  currencySymbol: {
    fontSize: 6
  },
  pageNumber: {
    position: "absolute",
    bottom: 10, // Distance from bottom of page
    right: 20, // Distance from right of page
    fontSize: 8,
    textAlign: "right"
  },
  bankdetails: {
    width: "100%",
    borderTop: "1px solid #0371C1",
    padding: 5,
    flexDirection: "row",
    // fontSize: 10,
    gap: 10
  },
  dataRowBank: {
    flexDirection: "row",
    // justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 1,
    gap: 0
  },
  tableLabelBank: {
    fontSize: 8,
    fontWeight: "bold",
    // width: "30%", // Fixed width for labels
    flexShrink: 0,
    wrap: true,
    hyphens: "none"
  },
  tableValueBank: {
    fontSize: 8,
    fontWeight: "normal",
    // width: "70%", // Fixed width for values
    flexShrink: 1,
    wrap: true,
    hyphens: "none"
  }
}

export const template1Styles = {
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    padding: 25,
    paddingBottom: 30,
    fontFamily: "Helvetica"
  },

  tableWrapper: {
    position: "relative",
    flexDirection: "column"
  },

  pageBottomBorder: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#0371C1"
  },

  columnBackground: {
    position: "absolute",
    top: 0,
    bottom: 0,
    zIndex: -1 // Ensure it stays behind the content
  },
  header: {
    display: "flex",
    flexDirection: "row",
    // marginBottom: 1,
    // borderBottom: '1px solid #000',
    paddingBottom: 4,
    alignItems: "center",
    textAlign: "center"
  },
  headerLeft: {
    alignItems: "flex-start"
  },
  headerRight: {
    alignItems: "flex-start",
    // backgroundColor:"red",
    width: "100%",
    marginLeft: 20
  },
  logo: {
    width: 70,
    height: 70,
    marginRight: 5
  },
  companyName: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
    marginLeft: 2
  },
  address: {
    fontSize: 10,
    marginBottom: 3,
    lineHeight: 1.2,
    marginLeft: 2,
    alignItems: "flex-start",
    textAlign: "left"
  },
  contactInfo: {
    fontSize: 10,
    lineHeight: 1.2,
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    alignItems: "center"
  },

  contactLabel: {
    fontSize: 10,
    fontWeight: "bold"
  },
  contactValue: {
    fontSize: 10,
    fontWeight: "normal"
  },
  section: {
    // border: "1.5px solid #0371C1",
    padding: 0
  },
  tableHeader: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    border: "1.5px solid #0371C1"
  },
  gstRow: {
    flexDirection: "row",
    padding: 3
  },
  gstLabel: {
    fontSize: 10,
    fontWeight: "bold"
  },
  gstValue: {
    fontSize: 10,
    fontWeight: "normal"
  },
  invoiceTitleRow: {
    padding: 3
  },
  invoiceTitle: {
    fontSize: 16,
    fontWeight: "extrabold",
    textAlign: "center",
    color: "#0371C1"
  },
  recipientRow: {
    padding: 3
  },
  recipientText: {
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "center"
  },

  threeColSection: {
    flexDirection: "row",
    // marginBottom: 10,
    borderBottom: "1.5px solid #0371C1",
    borderLeft: "1.5px solid #0371C1",
    borderRight: "1.5px solid #0371C1"
  },
  column: {
    width: "33.3%",
    paddingHorizontal: 4,
    borderLeft: "1px solid #0371C1"
  },
  columnHeader: {
    marginBottom: 5
  },
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 2
  },
  threecoltableHeader: {
    fontSize: 8,
    fontWeight: "bold"
  },
  tableLabel: {
    fontSize: 8,
    fontWeight: "bold",
    width: "40%", // Fixed width for labels
    flexShrink: 0,
    wrap: true,
    hyphens: "none"
  },
  tableValue: {
    fontSize: 8,
    fontWeight: "normal",
    width: "70%", // Fixed width for values
    flexShrink: 1,
    wrap: true,
    hyphens: "none"
  },

  // item table style
  itemsTable: {
    // marginTop: 10,
    // border: '1px solid #000',
  },
  tableContainer: {
    position: "relative",
    width: "100%",
    borderBottom: "1.5px solid #0371C1",
    borderLeft: "1.5px solid #0371C1",
    borderRight: "1.5px solid #0371C1"
  },
  verticalBorder: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "#0371C1"
  },
  itemsTableHeader: {
    flexDirection: "row",
    backgroundColor: "rgba(3, 113, 193, 0.2)",
    borderBottom: "1px solid #0371C1",
    borderTop: 0
  },
  headerCell: {
    // borderRight: '1px solid #0371C1',
    justifyContent: "center",
    alignItems: "center",
    padding: 2
  },
  itemsTableRow: {
    flexDirection: "row",
    // borderBottom: '1px solid #0371C1',
    alignItems: "flex-start"
  },
  itemsTableTotalRow: {
    flexDirection: "row",
    // borderTop: "1px solid #0371C1",
    backgroundColor: "rgba(3, 113, 193, 0.2)",
    alignItems: "center"
  },
  // Header Styles
  srNoHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "8%",
    textAlign: "center",
    padding: 2
  },
  productHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "25%",
    // textAlign: "center",
    padding: 3
    // borderLeft:"1px solid #0371C1"
  },
  hsnHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "10%",
    textAlign: "center",
    padding: 2
    // borderLeft:"1px solid #0371C1"
  },
  qtyHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "8%",
    textAlign: "center",
    padding: 2
    // borderLeft:"1px solid #0371C1"
  },
  rateHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "10%",
    textAlign: "center",
    padding: 2
    // borderLeft:"1px solid #0371C1"
  },
  taxableHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "12%",
    textAlign: "center",
    padding: 2
    // borderLeft:"1px solid #0371C1"
  },
  igstHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "12%"
    // borderLeft: "1px solid #0371C1",
    // borderRight: "1px solid #0371C1",
  },
  totalHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "15%",
    textAlign: "center",
    padding: 2
  },
  igstMainHeader: {
    fontSize: 7,
    fontWeight: "bold",
    textAlign: "center",
    padding: 1
  },
  igstSubHeader: { flexDirection: "row", borderTop: "1px solid #0371C1" },
  igstSubText: {
    fontSize: 6,
    fontWeight: "bold",
    width: "70%",
    textAlign: "center",
    padding: 1
  },
  igstSubPercentage: {
    fontSize: 6,
    fontWeight: "bold",
    width: "30%",
    textAlign: "center",
    padding: 1
  },

  // Cell Styles
  srNoCell: { fontSize: 7, width: "8%", textAlign: "center", padding: 3 },
  productCell: {
    fontSize: 7,
    width: "25%",
    textAlign: "left",
    padding: 3,
    // borderLeft: "1px solid #0371C1",
    wrap: true
  },
  hsnCell: {
    fontSize: 7,
    width: "10%",
    textAlign: "center",
    padding: 3,
    justifyContent: "flex-start", // 👈 positions text at the top
    alignItems: "center" // 👈 keeps it horizontally centered
    // borderLeft: "1px solid #0371C1",
  },

  qtyCell: {
    fontSize: 7,
    width: "8%",
    textAlign: "center",
    padding: 3
    // borderLeft: "1px solid #0371C1",
  },
  rateCell: {
    fontSize: 7,
    width: "10%",
    textAlign: "center",
    padding: 3
    // borderLeft: "1px solid #0371C1",
  },
  taxableCell: {
    fontSize: 7,
    width: "12%",
    textAlign: "center",
    padding: 3
    //  backgroundColor: "rgba(3, 113, 193, 0.2)",
    // borderLeft: "1px solid #0371C1",
    // borderRight: "1px solid #0371C1",
  },
  igstCell: {
    flexDirection: "row",
    width: "12%",
    display: "flex",
    justifyContent: "center", // horizontally center children
    alignItems: "center", // vertically center children
    gap: 10,
    // borderLeft: "1px solid #0371C1", // optional
    textAlign: "center",
    paddingVertical: 3
  },
  igstPercent: {
    fontSize: 7,
    textAlign: "center",
    padding: 1,
    width: "30%" // ensure consistent spacing
  },
  igstAmount: {
    fontSize: 7,
    textAlign: "center",
    padding: 1,
    width: "70%"
  },
  totalCell: {
    fontSize: 7,
    width: "15%",
    textAlign: "center",
    padding: 3
    // borderLeft: "1px solid #0371C1",
  },

  // Total Row Styles
  totalLabel: {
    fontSize: 7,
    fontWeight: "bold",
    textAlign: "center",
    padding: 2
  },
  totalEmpty: {
    fontSize: 7,
    width: "25%",
    padding: 2,
    textAlign: "center",
    fontWeight: "bold"
  },
  totalQty: {
    fontSize: 7,
    fontWeight: "bold",
    width: "8%",
    textAlign: "center",
    padding: 2
  },
  totalTaxable: {
    fontSize: 7,
    fontWeight: "bold",
    width: "12%",
    textAlign: "center",
    padding: 2
  },
  igstTotal: {
    // width: "12%",
    borderLeft: "1px solid #ddd",
    borderRight: "1px solid #ddd"
    // padding:2
  },
  totalIgstAmount: {
    fontSize: 7,
    fontWeight: "bold",
    textAlign: "right",
    padding: 2,
    paddingRight: 9
  },
  grandTotal: {
    fontSize: 7,
    fontWeight: "bold",
    width: "15%",
    textAlign: "center",
    padding: 2
  },

  // igstHeader: {
  //   flexDirection: 'row',
  //   width: '12%',
  //   borderLeft: '1px solid #000',
  //   borderRight: '1px solid #000',
  // },
  igstPercentHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "50%",
    textAlign: "center",
    padding: 2,
    borderRight: "1px solid #000"
  },
  igstAmountHeader: {
    fontSize: 7,
    fontWeight: "bold",
    width: "50%",
    textAlign: "center",
    padding: 2
  },

  igstPercentCell: {
    fontSize: 7,
    // width: '50%',
    textAlign: "center",
    padding: 2
    // borderRight: '1px solid #ddd',
  },
  igstAmountCell: {
    fontSize: 7,
    // width: '50%',
    textAlign: "center",
    padding: 2
  },

  bottomSection: {
    flexDirection: "row",
    width: "100%",
    fontSize: 7,
    borderLeft: "1.5px solid #0371C1",
    borderRight: "1.5px solid #0371C1",
    borderBottom: "1.5px solid #0371C1"
  },

  // Left half
  leftSection: {
    width: "65%",
    borderRight: "1px solid #0371C1"
  },

  totalInWords: {
    fontSize: 7,
    fontWeight: "bold",
    borderBottom: "1px solid #0371C1",
    padding: 3,
    textTransform: "uppercase"
  },

  termsBox: {
    // marginTop: 3,
    padding: 8,
    paddingTop: 0
  },
  termLine: {
    fontSize: 7,
    marginBottom: 1
  },

  qrContainer: {
    alignItems: "center",
    marginTop: 6
  },
  qrImage: {
    width: 45,
    height: 45
  },
  qrText: {
    fontSize: 7,
    marginTop: 2
  },

  // Right half
  rightSection: {
    width: "35%",
    justifyContent: "flex-start"
  },

  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottom: "1px solid #0371C1",
    padding: 3
  },

  label: { fontSize: 8, fontWeight: "bold" },
  value: { fontSize: 8, fontWeight: "bold" },

  labelBold: { fontSize: 8, fontWeight: "bold" },
  valueBold: { fontSize: 8, fontWeight: "bold" },

  highlightRow: {
    backgroundColor: "#EAF4FF"
  },

  currencySymbol: {
    fontSize: 6
  },

  //hst summary table

  // Add these styles to your templateA5_3Styles
  hsnTaxTable: {
    // border: '1px solid #0371C1',
    backgroundColor: "#FFFFFF"
  },
  hsnTaxTableTitle: {
    backgroundColor: "#0371C1",
    color: "#FFFFFF",
    // padding: 6,
    fontSize: 8,
    fontWeight: "bold",
    textAlign: "center"
  },
  hsnTaxTableHeader: {
    flexDirection: "row",
    backgroundColor: "#f0f8ff",
    borderBottom: "1px solid #0371C1"
  },
  hsnTaxHeaderCell: {
    padding: 1,
    fontSize: 7,
    fontWeight: "bold",
    borderRight: "0.5px solid #0371C1",
    textAlign: "center"
  },
  hsnTaxTableRow: {
    flexDirection: "row",
    borderBottom: "0.5px solid #0371C1"
  },
  hsnTaxCell: {
    padding: 1,
    fontSize: 7,
    borderRight: "1px solid #0371C1",
    textAlign: "center"
  },
  hsnTaxTableTotalRow: {
    flexDirection: "row",
    backgroundColor: "rgba(3, 113, 193, 0.2)"
    // borderTop: '1px solid #0371C1',
  },
  hsnTaxTotalCell: {
    padding: 1,
    fontSize: 7,
    fontWeight: "bold",
    borderRight: "1px solid #0371C1",
    textAlign: "center"
  },

  pageNumber: {
    position: "absolute",
    bottom: 20, // Distance from bottom of page
    right: 20, // Distance from right of page
    fontSize: 8,
    textAlign: "right"
  }
}

export const template_t3 = {
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    padding: 10,
    fontSize: 8,
    fontFamily: "Courier",
    width: "100%"
  },
  centerText: {
    textAlign: "center",
    width: "100%"
  },
  boldText: {
    fontWeight: "bold"
    // fontFamily: 'Courier-Bold',
  },
  companyName: {
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 2
    // fontFamily: 'Courier-Bold',
  },
  companyAddress: {
    fontSize: 7,
    textAlign: "center",
    lineHeight: 1.2,
    marginBottom: 3
  },
  invoiceTitle: {
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "center",
    marginVertical: 4
    // textDecoration: 'underline',
    // fontFamily: 'Courier-Bold',
  },
  section: {},
  billedinvoice: {
    display: "flex",
    justifyContent: "space-between"
  },
  sectionTitle: {
    fontSize: 8,
    fontWeight: "bold",
    marginBottom: 2
    // fontFamily: 'Courier-Bold',
  },
  line: {
    borderBottom: "1px solid #000",
    marginVertical: 3
  },
  dashedLine: {
    borderBottom: "1px double-dashed #000",
    marginVertical: 3
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 1
  },
  col: {
    flexDirection: "column"
  },
  itemsHeader: {
    flexDirection: "row",
    borderBottom: "1px solid #000",
    borderTop: "1px solid #000",
    paddingVertical: 2,
    marginBottom: 2
  },
  itemRow: {
    flexDirection: "row",
    paddingVertical: 1,
    borderBottom: "0.5px solid #666"
  },
  colSr: {
    width: "8%",
    textAlign: "center"
  },
  colItem: {
    width: "42%",
    paddingLeft: 2
  },
  colHsn: {
    width: "20%",
    textAlign: "left"
  },
  colQty: {
    width: "10%",
    textAlign: "center"
  },
  colRate: {
    width: "12%",
    textAlign: "right",
    paddingRight: 2
  },
  colTotal: {
    width: "18%",
    textAlign: "right",
    paddingRight: 2
  },
  totalSection: {
    marginTop: 4,
    borderTop: "1px solid #000",
    paddingTop: 3
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 1
  },
  footer: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 7,
    lineHeight: 1.2
  }
}

// Template 18 specific styles

export const template18Styles = {
  // --- Page and Content Layout ---
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    paddingVertical: 24,
    paddingHorizontal: 150,
    fontSize: 8,
    fontFamily: "Helvetica"
  },
  pageContent: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "flex-start",
    gap: 4
  }, // --- Typography Utilities ---
  separator: {
    fontSize: 8,
    textAlign: "center",
    marginVertical: 1,
    color: "#000000"
  },
  separatorBold: {
    fontSize: 7,
    textAlign: "center",
    marginVertical: 1,
    fontWeight: "bold",
    color: "#000000"
  },
  separatorDouble: {
    fontSize: 8,
    textAlign: "center",
    marginVertical: 1,
    fontWeight: "extrabold",
    letterSpacing: 0.5,
    color: "#000000"
  }, // --- Company Header (Top Centered) ---

  companyHeaderSection: {
    alignItems: "center",
    marginBottom: 8
  },
  companyNameTop: {
    fontSize: 9,
    fontWeight: "bold",
    marginBottom: 1,
    color: "#000000"
  },
  address: {
    fontSize: 8,
    textAlign: "center",
    lineHeight: 1.2,
    color: "#000000"
  },
  gstin: {
    fontSize: 8,
    marginTop: 1,
    color: "#000000",
    textAlign: "center"
  }, // --- Invoice Title and Meta Row (Updated Alignment) ---
  invoiceTitleContainer: {
    // Container for centering the title
    alignItems: "center",
    marginBottom: 2
    // width: 280,
    // paddingRight:60
  },
  invoiceTitle: {
    fontSize: 8,
    fontWeight: "bold",
    textAlign: "center",
    color: "#000000",
    width: 280
    // paddingRight:60
  },
  invoiceMetaRow: {
    // Aligns INVOICE # and DATE left and right, spanning full width
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4
    // width: 260,
    // paddingLeft: 15,
  },
  invoiceMetaTextLeft: {
    fontSize: 8,
    fontWeight: "normal",
    color: "#000000",
    lineHeight: 1.3,
    textAlign: "left"
  },
  invoiceMetaTextRight: {
    fontSize: 8,
    fontWeight: "normal",
    color: "#000000",
    lineHeight: 1.3,
    textAlign: "right"
  }, // --- Billed To Section ---

  billedToBox: {
    flexDirection: "column",
    alignItems: "center",
    paddingRight: 0
  },
  billedToHeader: {
    fontSize: 7,
    fontWeight: "bold",
    color: "#000000", // FIXED SYNTAX ERROR: removed trailing '
    textAlign: "center",
    marginBottom: 1,
    width: 300
  },
  billedToText: {
    fontSize: 8,
    fontWeight: "normal",
    color: "#000000",
    lineHeight: 1.3,
    marginLeft: 0,
    width: "100%",
    textAlign: "center"
  }, // --- Items Table (Simplified look from image) ---

  itemsTableHeaderSimple: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingLeft: 0
  },
  itemsHeaderColumn: {
    fontSize: 8,
    fontWeight: "bold",
    padding: 1,
    color: "#000000",
    lineHeight: 1.3 // Removed borderRight to match the image's line-separated text style
  },
  itemsTableSimple: {
    flexDirection: "column",
    paddingLeft: 1
  },
  itemsTableRowSimple: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 4,
    marginTop: 4,
    marginLeft: 0,
    paddingBottom: 4
    // borderBottom: "0.5px dotted #000000",
  },
  itemDetailsCell: {
    flexDirection: "column",
    justifyContent: "flex-start"
  },
  itemNameText: {
    fontSize: 8,
    fontWeight: "normal",
    color: "#000000"
  },
  itemSubText: {
    fontSize: 8,
    fontWeight: "normal",
    color: "#000000",
    lineHeight: 1.3
  },
  taxablePlusGSTCell: {
    flexDirection: "column",
    // alignItems: "flex-end",
    justifyContent: "flex-start"
  },
  taxableValueText: {
    fontSize: 8,
    fontWeight: "normal",
    color: "#000000",
    paddingRight: 0,
    paddingLeft: "30px",
    flexDirection: "row"
  },
  gstRateText: {
    fontSize: 8,
    fontWeight: "normal",
    color: "#000000",
    lineHeight: 1.3,
    paddingRight: 0,
    paddingLeft: "30px"
  },
  totalCellSimple: {
    fontSize: 8,
    fontWeight: "normal",
    textAlign: "right",
    color: "#000000",
    paddingLeft: 30
  },
  totalCellSimpleRs: {
    fontSize: 8,
    fontWeight: "normal",
    textAlign: "right",
    color: "#000000",
    paddingLeft: 0
  },
  taxableValueTextrs: {
    fontSize: 8,
    fontWeight: "normal",
    color: "#000000",
    paddingLeft: 200
  }, // --- Summary Section ---

  summaryContainer: {
    marginTop: 4,
    flexDirection: "column",
    // alignItems: "center",
    width: 350
  },
  separatorSummary: {
    fontSize: 8,
    textAlign: "center",
    marginBottom: 1,
    fontWeight: "extrabold",
    letterSpacing: 0.5,
    color: "#000000",
    width: "100%",
    content: "================SUMMARY========================"
  },
  summarySection: {
    width: "75%",
    flexDirection: "column"
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 1
  },
  summaryLabel: {
    fontSize: 8,
    fontWeight: "normal",
    color: "#000000"
  },
  summaryValue: {
    fontSize: 8,
    fontWeight: "normal",
    color: "#000000"
  },
  summaryLabelGrand: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#000000"
  },
  summaryValueGrand: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#000000"
  }, // --- QR Code/UPI Section ---
  qrCodeSection: {
    marginTop: 10,
    alignItems: "center",
    marginBottom: 10,
    marginLeft: 58,
    width: "100%"
  },
  qrCodePlaceholder: {
    width: 60,
    height: 60,
    border: "1px solid black",
    alignItems: "center",
    justifyContent: "center"
  },
  qrCodePlaceholderText: {
    fontSize: 6,
    color: "#000000",
    textAlign: "center"
  },
  payUsingUpi: {
    fontSize: 7,
    fontWeight: "normal",
    color: "#000000",
    marginTop: 2
  }, // --- UNUSED STYLES (from template8 that aren't mapped) ---

  title: {},
  dividerBlue: {},
  divider: {},
  table: {},
  tableHeader: {},
  tableCellHeader: {},
  tableRow: {},
  tableCell: {},
  tableCellSize7: {},
  tableCellLast: {},
  totalsSection: {},
  totalsLeft: {},
  totalsRight: {},
  totalsRow: {},
  smallRs: {},
  paymentSection: {},
  termsSection: {},
  boldText: {},
  normalText: {},
  grayColor: {},
  sectionHeader: {}
}
