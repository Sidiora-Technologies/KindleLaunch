'use client';

import Button from "@/ui/atoms/Button";
import AirdropButton from "../SubComponent/AirdropComponent";
import AvatarComponent from "../SubComponent/AvatarComponent";
import StarComponent from "../SubComponent/StarComponent";
import GlobalSearch from "@/shell/global-search";

import notificationImg from "@/assets/icons/alert.svg";
import speakerImg from "@/assets/icons/Speaker.svg";

const RightButtonGroup = () => {
    return (
      <div className="flex justify-center items-center gap-2">

        {/* Search Bar */}
        <div className="w-48 lg:w-64">
          <GlobalSearch />
        </div>

        <div className="flex justify-center items-center">
          <div className="hidden md:flex justify-around items-center gap-2 mr-2">
            
            {/* Speaker */}
            <Button icon={speakerImg} backgroundColor="bg-gradient-black-gray"/>
            
            {/* Star */}
            <StarComponent />
            
            {/* Notification */}
            <Button icon={notificationImg} alert={true} backgroundColor="bg-gradient-black-gray"/>
            
            {/* Airdrop */}
            <AirdropButton />
          </div>
            
          {/* Avatar Dropdown */}
          <AvatarComponent />
        </div>
      </div>
    );
  };
 
  export default RightButtonGroup;