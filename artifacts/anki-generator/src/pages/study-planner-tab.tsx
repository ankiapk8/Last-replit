import { Router, Switch, Route } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { StudyTopicsProvider } from "@/context/study-topics-context";

import SPHome from "@/pages/study-planner/home";
import SPSettings from "@/pages/study-planner/settings";
import SubMedicine from "@/pages/study-planner/sub-medicine";
import SubSurgery from "@/pages/study-planner/sub-surgery";
import SPGynecology from "@/pages/study-planner/gynecology";
import TopicPage from "@/pages/study-planner/topic-page";
import ManageSubjects from "@/pages/study-planner/manage-subjects";
import CustomGroupPage from "@/pages/study-planner/custom-group-page";
import DynamicTopicPage from "@/pages/study-planner/dynamic-topic-page";

const { hook: usePlannerLocation } = memoryLocation({ path: "/" });

export function StudyPlannerTab() {
  return (
    <StudyTopicsProvider>
      <Router hook={usePlannerLocation}>
        <Switch>
          <Route path="/" component={SPHome} />
          <Route path="/settings" component={SPSettings} />
          <Route path="/manage-subjects" component={ManageSubjects} />
          <Route path="/custom/:groupId" component={CustomGroupPage} />
          <Route path="/subject/:storageKey" component={DynamicTopicPage} />
          <Route path="/sub-medicine" component={SubMedicine} />
          <Route path="/sub-surgery" component={SubSurgery} />
          <Route path="/gynecology" component={SPGynecology} />
          <Route path="/psychiatric"               component={() => <TopicPage path="/psychiatric" />} />
          <Route path="/pediatric"                 component={() => <TopicPage path="/pediatric" />} />
          <Route path="/sub-medicine/dermatology"  component={() => <TopicPage path="/sub-medicine/dermatology" />} />
          <Route path="/sub-medicine/family"       component={() => <TopicPage path="/sub-medicine/family" />} />
          <Route path="/sub-medicine/emergency"    component={() => <TopicPage path="/sub-medicine/emergency" />} />
          <Route path="/sub-medicine/forensic"     component={() => <TopicPage path="/sub-medicine/forensic" />} />
          <Route path="/sub-medicine/radiology"    component={() => <TopicPage path="/sub-medicine/radiology" />} />
          <Route path="/sub-surgery/ent"           component={() => <TopicPage path="/sub-surgery/ent" />} />
          <Route path="/sub-surgery/ophthalmology" component={() => <TopicPage path="/sub-surgery/ophthalmology" />} />
          <Route path="/sub-surgery/orthopedic"    component={() => <TopicPage path="/sub-surgery/orthopedic" />} />
          <Route path="/sub-surgery/neurosurgery"  component={() => <TopicPage path="/sub-surgery/neurosurgery" />} />
          <Route path="/sub-surgery/urology"       component={() => <TopicPage path="/sub-surgery/urology" />} />
          <Route path="/gynecology/gynecology"     component={() => <TopicPage path="/gynecology/gynecology" />} />
          <Route path="/gynecology/obstetric"      component={() => <TopicPage path="/gynecology/obstetric" />} />
        </Switch>
      </Router>
    </StudyTopicsProvider>
  );
}
