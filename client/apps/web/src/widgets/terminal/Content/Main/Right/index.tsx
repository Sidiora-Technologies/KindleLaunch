import AnalyticsComponent from "./AnalyticsComponent";
import BuySellComponent from "./BuySellComponent";
import FilterComponent from "./FilterComponent";
import SimilarTokenComponent from "./SimilarTokenComponent";
import StatisticComponent from "./StatisticComponent";
import TokenInfoComponent from "./TokenInfoComponent";

const RightComponent = () => {
    return (
        <div className="flex flex-col gap-1.5 w-full text-white">
            <AnalyticsComponent />
            <BuySellComponent />
            <StatisticComponent />
            <TokenInfoComponent />
            <FilterComponent />
            <SimilarTokenComponent />
        </div>
    );
  };
  
  export default RightComponent;