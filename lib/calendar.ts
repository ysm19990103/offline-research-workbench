import months from './lunar-months.json';
import {validDate} from './tasks';
const STEMS='甲乙丙丁戊己庚辛壬癸',BRANCHES='子丑寅卯辰巳午未申酉戌亥';
const STEM_ELEMENTS=['木','木','火','火','土','土','金','金','水','水'];
const BRANCH_ELEMENTS=['水','土','木','木','土','火','火','土','金','金','土','水'];
const NAYIN=['海中金','炉中火','大林木','路旁土','剑锋金','山头火','涧下水','城头土','白蜡金','杨柳木','泉中水','屋上土','霹雳火','松柏木','长流水','沙中金','山下火','平地木','壁上土','金箔金','覆灯火','天河水','大驿土','钗钏金','桑柘木','大溪水','沙中土','天上火','石榴木','大海水'];
const LUNAR_MONTHS=['正','二','三','四','五','六','七','八','九','十','冬','腊'];
const LUNAR_DAYS=['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
export function calendarInfo(date:string) {
 if(!validDate(date)||date<'1900-01-01'||date>'2099-12-31')throw new Error('日历支持 1900—2099 年。');
 const epoch=Math.floor(Date.parse(date+'T00:00:00Z')/86400000);
 let lo=0,hi=months.length-1;
 while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(months[mid][0]<=epoch)lo=mid;else hi=mid-1;}
 const [start,year,month,leap]=months[lo],day=epoch-start+1;
 if(day<1||day>30)throw new Error('日历数据超出范围。');
 const cycle=((epoch+2440588+49)%60+60)%60,gan=STEMS[cycle%10],zhi=BRANCHES[cycle%12];
 const name=`${leap?'闰':''}${LUNAR_MONTHS[month-1]}月${LUNAR_DAYS[day-1]}`;
 const y=((year-4)%60+60)%60;
 const festivals:Record<string,string>={'1-1':'春节','1-15':'元宵节','5-5':'端午节','7-7':'七夕','7-15':'中元节','8-15':'中秋节','9-9':'重阳节','12-8':'腊八'};
 return {date,lunarYear:year,lunarMonth:month,lunarDay:day,isLeap:!!leap,lunarName:name,lunarShort:day===1?`${leap?'闰':''}${LUNAR_MONTHS[month-1]}月`:LUNAR_DAYS[day-1],yearGanzhi:STEMS[y%10]+BRANCHES[y%12],ganzhi:gan+zhi,stemElement:STEM_ELEMENTS[cycle%10],branchElement:BRANCH_ELEMENTS[cycle%12],elementText:`${gan}${STEM_ELEMENTS[cycle%10]} · ${zhi}${BRANCH_ELEMENTS[cycle%12]}`,nayin:NAYIN[Math.floor(cycle/2)],festival:leap?'':festivals[`${month}-${day}`]??''};
}
