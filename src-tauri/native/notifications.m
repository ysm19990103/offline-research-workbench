#import <Foundation/Foundation.h>
#import <UserNotifications/UserNotifications.h>
#include <stdlib.h>
#include <string.h>

@interface WBNotificationDelegate : NSObject <UNUserNotificationCenterDelegate>
@end
@implementation WBNotificationDelegate
- (void)userNotificationCenter:(UNUserNotificationCenter *)center
      willPresentNotification:(UNNotification *)notification
        withCompletionHandler:(void (^)(UNNotificationPresentationOptions))completionHandler {
    completionHandler(UNNotificationPresentationOptionBanner | UNNotificationPresentationOptionSound);
}
@end

static char *WBResult(NSString *state, NSUInteger scheduled, NSString *message) {
    NSMutableDictionary *result=[@{@"state":state,@"scheduled":@(scheduled)} mutableCopy];
    if(message)result[@"message"]=message;
    NSData *data=[NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
    return strdup([[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding].UTF8String);
}
// Called on a Rust worker, never the UI thread. Only Apple's notification service
// handles delivery after quit; no helper process, osascript, or LaunchAgent.
char *wb_sync_notifications(const char *input) {
    @autoreleasepool {
        NSError *parseError=nil;
        NSDictionary *payload=[NSJSONSerialization JSONObjectWithData:[[NSString stringWithUTF8String:input] dataUsingEncoding:NSUTF8StringEncoding] options:0 error:&parseError];
        if(!payload)return WBResult(@"denied",0,@"通知排程格式无效。");
        UNUserNotificationCenter *center=UNUserNotificationCenter.currentNotificationCenter;
        static WBNotificationDelegate *delegate;
        static dispatch_once_t once;
        dispatch_once(&once, ^{delegate=[WBNotificationDelegate new];});
        center.delegate=delegate;
        __block UNAuthorizationStatus status=UNAuthorizationStatusNotDetermined;
        dispatch_semaphore_t settings=dispatch_semaphore_create(0);
        [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *s){status=s.authorizationStatus;dispatch_semaphore_signal(settings);}];
        if(dispatch_semaphore_wait(settings,dispatch_time(DISPATCH_TIME_NOW,10*NSEC_PER_SEC))!=0)return WBResult(@"denied",0,@"读取系统通知设置超时，请重试。");
        if(status==UNAuthorizationStatusNotDetermined && [payload[@"requestPermission"] boolValue]) {
            dispatch_semaphore_t permission=dispatch_semaphore_create(0);
            __block BOOL granted=NO;
            [center requestAuthorizationWithOptions:UNAuthorizationOptionAlert|UNAuthorizationOptionSound completionHandler:^(BOOL allowed,NSError *error){granted=allowed;dispatch_semaphore_signal(permission);}];
            if(dispatch_semaphore_wait(permission,dispatch_time(DISPATCH_TIME_NOW,120*NSEC_PER_SEC))!=0)return WBResult(@"notDetermined",0,@"请完成系统通知授权后重试。");
            status=granted?UNAuthorizationStatusAuthorized:UNAuthorizationStatusDenied;
        }
        if(status!=UNAuthorizationStatusAuthorized && status!=UNAuthorizationStatusProvisional)return WBResult(status==UNAuthorizationStatusNotDetermined?@"notDetermined":@"denied",0,@"请在系统设置中允许工作台通知。");
        NSArray *items=payload[@"items"];
        NSMutableSet *wanted=[NSMutableSet set];
        NSUInteger scheduled=0;
        for(NSDictionary *item in items) {
            NSString *identifier=item[@"id"];
            if(![identifier hasPrefix:@"workbench."])continue;
            [wanted addObject:identifier];
            UNMutableNotificationContent *content=[UNMutableNotificationContent new];
            content.title=item[@"title"];content.body=item[@"body"];content.sound=UNNotificationSound.defaultSound;
            UNNotificationTrigger *trigger;
            if([item[@"daily"] boolValue]) {
                NSDateComponents *components=[NSDateComponents new];components.hour=22;components.minute=0;
                trigger=[UNCalendarNotificationTrigger triggerWithDateMatchingComponents:components repeats:YES];
            } else {
                NSDate *date=[NSDate dateWithTimeIntervalSince1970:[item[@"at"] doubleValue]];
                NSDateComponents *components=[NSCalendar.currentCalendar components:NSCalendarUnitYear|NSCalendarUnitMonth|NSCalendarUnitDay|NSCalendarUnitHour|NSCalendarUnitMinute|NSCalendarUnitSecond fromDate:date];
                components.timeZone=NSTimeZone.localTimeZone;
                trigger=[UNCalendarNotificationTrigger triggerWithDateMatchingComponents:components repeats:NO];
            }
            dispatch_semaphore_t added=dispatch_semaphore_create(0);
            __block NSString *failure=nil;
            [center addNotificationRequest:[UNNotificationRequest requestWithIdentifier:identifier content:content trigger:trigger] withCompletionHandler:^(NSError *error){failure=error.localizedDescription;dispatch_semaphore_signal(added);}];
            if(dispatch_semaphore_wait(added,dispatch_time(DISPATCH_TIME_NOW,10*NSEC_PER_SEC))!=0)return WBResult(@"denied",scheduled,@"保存系统提醒超时，请重试。");
            if(failure)return WBResult(@"denied",scheduled,failure);
            scheduled++;
        }
        // Cancel obsolete/completed/re-dated tasks only after new requests succeed.
        dispatch_semaphore_t reconciled=dispatch_semaphore_create(0);
        [center getPendingNotificationRequestsWithCompletionHandler:^(NSArray<UNNotificationRequest *> *requests){
            NSMutableArray *remove=[NSMutableArray array];
            for(UNNotificationRequest *request in requests)if([request.identifier hasPrefix:@"workbench."]&&![wanted containsObject:request.identifier])[remove addObject:request.identifier];
            [center removePendingNotificationRequestsWithIdentifiers:remove];dispatch_semaphore_signal(reconciled);
        }];
        if(dispatch_semaphore_wait(reconciled,dispatch_time(DISPATCH_TIME_NOW,10*NSEC_PER_SEC))!=0)return WBResult(@"denied",scheduled,@"更新系统提醒超时，请重试。");
        return WBResult(@"granted",scheduled,nil);
    }
}
void wb_free_string(char *value) {free(value);}
