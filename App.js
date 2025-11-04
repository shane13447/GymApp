import './global.css';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function App() {
  return (
    <SafeAreaView className="flex-1 bg-gray-900 p-4">
      <View className="flex-1 items-center justify-center">
        <Text className="text-3xl font-bold text-teal-400">
          Gym Tracker Running!
        </Text>
        <Text className="text-sm text-gray-400 mt-2">
          If this text is teal, NativeWind is working.
        </Text>
      </View>
      <StatusBar style="light" />
    </SafeAreaView>
  );
}