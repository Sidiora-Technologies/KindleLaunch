'use client';

import List from "./List";
import Ranking from "./Ranking";

const LeftComponent = () => {

    return (
      <div className={`flex flex-col gap-4 w-full text-white`}>
        <Ranking/>
        <List />
      </div>
    );
  };
  
  export default LeftComponent;