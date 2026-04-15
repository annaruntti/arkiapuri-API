interface MonthlyCosts {
    railway: number;
    mongodb: number;
    total: number;
}
interface CostCalculation {
    freeCosts: MonthlyCosts;
    minimumPaidCosts: MonthlyCosts;
}
declare const calculateMonthlyCosts: () => CostCalculation;
export default calculateMonthlyCosts;
//# sourceMappingURL=cost-calculator.d.ts.map